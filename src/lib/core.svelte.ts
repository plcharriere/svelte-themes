import { loadCss } from './config.js';
import { getServerTheme } from './ssr-store.js';
import type { Matcher, Scheme, ThemeLoader } from './types.js';

/**
 * Sentinel scope value used by shared-scheme broadcasts so scopes which
 * don't own their scheme can still react to each other's scheme changes.
 *
 * Real scope names must match `^[A-Za-z0-9_-]+$` (validated by
 * `createScopedThemes`), so the `@` prefix guarantees no collision.
 */
export const SHARED_SCHEME_SCOPE = '@shared';

export type SyncMessage =
	| { kind: 'theme'; scope: string; name: string }
	| { kind: 'scheme'; scope: string; scheme: Scheme };

type SchemeCookieValue = Scheme | null;

export type ThemeScopeConfig = {
	name: string;
	themes: Record<string, ThemeLoader>;
	defaultTheme: string;
	defaultScheme: Scheme;
	cookieTheme: string;
	cookieScheme: string;
	/**
	 * True when this scope owns its scheme (its own cookie + default).
	 * False when the scope inherits a shared top-level scheme — the
	 * cross-tab sync routes scheme messages through the `@shared` sentinel
	 * so every shared-scheme scope sees the change.
	 */
	independentScheme: boolean;
	syncTabs: boolean;
	syncChannel: string;
};

/**
 * Pure helper: build a properly-tagged `SyncMessage`. Extracted so the
 * broadcast shape is unit-testable without instantiating a scope.
 *
 * Theme messages always carry the broadcaster's scope name. Scheme messages
 * use the scope name when the broadcaster owns its scheme, or the
 * `@shared` sentinel when it inherits the top-level scheme.
 */
export function buildSyncMessage(
	kind: 'theme',
	scopeName: string,
	independentScheme: boolean,
	payload: { name: string }
): SyncMessage;
export function buildSyncMessage(
	kind: 'scheme',
	scopeName: string,
	independentScheme: boolean,
	payload: { scheme: Scheme }
): SyncMessage;
export function buildSyncMessage(
	kind: 'theme' | 'scheme',
	scopeName: string,
	independentScheme: boolean,
	payload: { name: string } | { scheme: Scheme }
): SyncMessage {
	if (kind === 'theme') {
		return { kind: 'theme', scope: scopeName, name: (payload as { name: string }).name };
	}
	const tag = independentScheme ? scopeName : SHARED_SCHEME_SCOPE;
	return { kind: 'scheme', scope: tag, scheme: (payload as { scheme: Scheme }).scheme };
}

/**
 * Pure decision helper: should this scope act on an incoming sync message?
 *
 * - Theme messages: only when the message's scope tag matches the receiver.
 * - Scheme messages on an independent-scheme receiver: only when the scope
 *   tag matches the receiver (other independent scopes are ignored).
 * - Scheme messages on a shared-scheme receiver: only when tagged
 *   `@shared` (other scopes' independent scheme changes are ignored).
 */
export function shouldHandleSyncMessage(
	receiver: { name: string; independentScheme: boolean },
	msg: SyncMessage
): boolean {
	if (msg.kind === 'theme') {
		return msg.scope === receiver.name;
	}
	if (receiver.independentScheme) {
		return msg.scope === receiver.name;
	}
	return msg.scope === SHARED_SCHEME_SCOPE;
}

function regexEscape(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class ThemeScope {
	readonly config: ThemeScopeConfig;

	themeState = $state<string | null>(null);
	themeCookieValue = $state<string | null>(null);
	darkState = $state<boolean | null>(null);
	schemeCookieValue = $state<SchemeCookieValue>(null);
	pendingLoads = $state<number>(0);
	loadingName = $state<string | null>(null);

	#latestCall = 0;
	#bc: BroadcastChannel | null = null;
	#mql: MediaQueryList | null = null;
	#mqlListener: ((e: MediaQueryListEvent) => void) | null = null;

	constructor(config: ThemeScopeConfig) {
		this.config = config;
	}

	#readSchemeCookie(): SchemeCookieValue {
		const re = new RegExp(`(?:^|;\\s*)${regexEscape(this.config.cookieScheme)}=([^;]*)`);
		const m = document.cookie.match(re);
		if (!m) return null;
		const v = decodeURIComponent(m[1]);
		if (v === 'light' || v === 'dark' || v === 'system') return v;
		return null;
	}

	#readThemeCookie(): string | null {
		const cfg = this.config;
		const re = new RegExp(`(?:^|;\\s*)${regexEscape(cfg.cookieTheme)}=([^;]*)`);
		const m = document.cookie.match(re);
		if (!m) return null;
		const v = decodeURIComponent(m[1]);
		return Object.hasOwn(cfg.themes, v) ? v : null;
	}

	#setCookie(name: string, value: string): void {
		const secure = location.protocol === 'https:' ? '; Secure' : '';
		document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=31536000; SameSite=Lax${secure}`;
	}

	#applyTheme(name: string, css: string): void {
		let style = document.getElementById('svelte-themes') as HTMLStyleElement | null;
		if (!style) {
			style = document.createElement('style');
			style.id = 'svelte-themes';
			document.head.appendChild(style);
		}
		style.textContent = css;
		document.documentElement.dataset.theme = name;
		this.themeState = name;
	}

	#applyDark(dark: boolean): void {
		document.documentElement.classList.toggle('dark', dark);
		this.darkState = dark;
	}

	/**
	 * Resolve the theme this scope should currently be on, based on its own
	 * theme cookie (if valid) or its `defaultTheme`. Browser-only — the cookie
	 * read needs `document`.
	 */
	resolveTargetThemeFromCookie(): string {
		if (typeof document === 'undefined') return this.config.defaultTheme;
		const fromCookie = this.#readThemeCookie();
		return fromCookie ?? this.config.defaultTheme;
	}

	/**
	 * Seed this scope's reactive state from its cookies only — no DOM listeners
	 * bound, no `<style>` content touched. Used for non-active scopes at init
	 * so their handle (`themes.foo.getCurrentTheme()`) returns *their* state,
	 * not whatever the active scope rendered into the DOM.
	 */
	seedStateFromCookies(): void {
		if (typeof document === 'undefined') return;
		const cfg = this.config;
		this.themeCookieValue = this.#readThemeCookie();
		this.themeState = this.themeCookieValue ?? cfg.defaultTheme;
		this.schemeCookieValue = this.#readSchemeCookie();
		const schemeCookie = this.schemeCookieValue;
		if (schemeCookie === 'dark') {
			this.darkState = true;
		} else if (schemeCookie === 'light') {
			this.darkState = false;
		} else if (schemeCookie === 'system') {
			this.darkState = matchMedia('(prefers-color-scheme: dark)').matches;
		} else if (cfg.defaultScheme === 'system') {
			this.darkState = matchMedia('(prefers-color-scheme: dark)').matches;
		} else {
			this.darkState = cfg.defaultScheme === 'dark';
		}
	}

	/**
	 * Re-read this scope's cookies and apply its target state atomically.
	 * Used by the cross-scope navigation hook to swap themes without a flash:
	 * the current theme stays rendered while the new CSS loads, then `<style>`
	 * content, `data-theme`, and (if this scope owns its scheme) the `dark`
	 * class swap together.
	 */
	async applyScopeStateFromCookies(): Promise<void> {
		if (typeof document === 'undefined') return;
		const cfg = this.config;

		const targetTheme = this.resolveTargetThemeFromCookie();
		const cookieValue = this.#readThemeCookie();

		// Pre-load CSS while the current theme stays visible, then apply
		// atomically — the no-flash guarantee.
		const callId = ++this.#latestCall;
		this.pendingLoads++;
		this.loadingName = targetTheme;
		try {
			const css = await loadCss(targetTheme);
			if (callId !== this.#latestCall) return;

			this.#applyTheme(targetTheme, css);
			this.themeCookieValue = cookieValue;

			const schemeCookie = this.#readSchemeCookie();
			this.schemeCookieValue = schemeCookie;
			if (schemeCookie === 'system') {
				this.#applyDark(matchMedia('(prefers-color-scheme: dark)').matches);
			} else if (schemeCookie === 'dark') {
				this.#applyDark(true);
			} else if (schemeCookie === 'light') {
				this.#applyDark(false);
			} else if (cfg.defaultScheme === 'system') {
				this.#applyDark(matchMedia('(prefers-color-scheme: dark)').matches);
			} else {
				this.#applyDark(cfg.defaultScheme === 'dark');
			}
		} finally {
			this.pendingLoads--;
			if (callId === this.#latestCall) this.loadingName = null;
		}
	}

	getThemes(): string[] {
		return Object.keys(this.config.themes);
	}

	getCurrentTheme(): string {
		if (typeof document === 'undefined') {
			return getServerTheme()?.theme ?? this.config.defaultTheme;
		}
		return this.themeState ?? document.documentElement.dataset.theme ?? this.config.defaultTheme;
	}

	getDefaultTheme(): string {
		return this.config.defaultTheme;
	}

	getThemeSource(): 'cookie' | 'default' {
		if (typeof document === 'undefined') {
			return getServerTheme()?.themeSource ?? 'default';
		}
		return this.themeCookieValue === null ? 'default' : 'cookie';
	}

	async setTheme(name: string, scheme?: Scheme): Promise<void> {
		if (typeof document === 'undefined') return;
		const cfg = this.config;
		if (!Object.hasOwn(cfg.themes, name)) {
			throw new Error(`Unknown theme: ${name}`);
		}
		const callId = ++this.#latestCall;
		this.pendingLoads++;
		this.loadingName = name;
		try {
			const css = await loadCss(name);
			if (callId !== this.#latestCall) return;
			this.#applyTheme(name, css);
			this.#setCookie(cfg.cookieTheme, name);
			this.themeCookieValue = name;
			this.#bc?.postMessage(
				buildSyncMessage('theme', cfg.name, cfg.independentScheme, { name })
			);
			if (scheme !== undefined) this.setScheme(scheme);
		} finally {
			this.pendingLoads--;
			if (callId === this.#latestCall) this.loadingName = null;
		}
	}

	isLoadingTheme(name?: string): boolean {
		if (name === undefined) return this.pendingLoads > 0;
		return this.loadingName === name;
	}

	getLoadingTheme(): string | null {
		return this.loadingName;
	}

	isDark(): boolean {
		if (typeof document === 'undefined') {
			const ss = getServerTheme();
			if (ss) return ss.dark;
			const ds = this.config.defaultScheme;
			return ds === 'dark';
		}
		return this.darkState ?? document.documentElement.classList.contains('dark');
	}

	getScheme(): Scheme {
		const cfg = this.config;
		if (typeof document === 'undefined') {
			const ss = getServerTheme();
			if (ss) return ss.scheme;
			return cfg.defaultScheme;
		}
		if (this.schemeCookieValue !== null) return this.schemeCookieValue;
		return cfg.defaultScheme;
	}

	getDefaultScheme(): Scheme {
		return this.config.defaultScheme;
	}

	getSchemeSource(): 'cookie' | 'default' {
		if (typeof document === 'undefined') {
			return getServerTheme()?.schemeSource ?? 'default';
		}
		return this.schemeCookieValue === null ? 'default' : 'cookie';
	}

	setScheme(scheme: Scheme): void {
		if (typeof document === 'undefined') return;
		const cfg = this.config;
		if (scheme === 'system') {
			this.#setCookie(cfg.cookieScheme, 'system');
			this.schemeCookieValue = 'system';
			this.#applyDark(matchMedia('(prefers-color-scheme: dark)').matches);
			this.#bc?.postMessage(
				buildSyncMessage('scheme', cfg.name, cfg.independentScheme, { scheme: 'system' })
			);
			return;
		}
		this.#applyDark(scheme === 'dark');
		this.#setCookie(cfg.cookieScheme, scheme);
		this.schemeCookieValue = scheme;
		this.#bc?.postMessage(
			buildSyncMessage('scheme', cfg.name, cfg.independentScheme, { scheme })
		);
	}

	toggleScheme(): void {
		this.setScheme(this.isDark() ? 'light' : 'dark');
	}

	/**
	 * Tear down any DOM/BC listeners this scope owns. Called when the active
	 * scope changes on cross-scope SPA navigation — without it, the previous
	 * scope's `matchMedia` listener would keep firing and could clobber the
	 * new active scope's `dark` class (for independent-scheme apps).
	 */
	disposeClient(): void {
		if (this.#mql && this.#mqlListener) {
			this.#mql.removeEventListener('change', this.#mqlListener);
		}
		this.#mql = null;
		this.#mqlListener = null;
		this.#bc?.close();
		this.#bc = null;
	}

	initClient(): void {
		if (typeof window === 'undefined') return;

		this.disposeClient();
		this.seedStateFromCookies();

		const cfg = this.config;

		this.#mql = matchMedia('(prefers-color-scheme: dark)');
		this.#mqlListener = (e) => {
			const v = this.#readSchemeCookie();
			if (v === 'system' || (v === null && this.config.defaultScheme === 'system')) {
				this.#applyDark(e.matches);
			}
		};
		this.#mql.addEventListener('change', this.#mqlListener);

		if (cfg.syncTabs) {
			this.#bc = new BroadcastChannel(cfg.syncChannel);
			this.#bc.addEventListener('message', (e) => {
				const msg = e.data as SyncMessage | null;
				if (!msg || typeof msg !== 'object') return;
				if (typeof msg.scope !== 'string') return;
				if (
					!shouldHandleSyncMessage(
						{ name: this.config.name, independentScheme: this.config.independentScheme },
						msg
					)
				) {
					return;
				}
				if (msg.kind === 'scheme') {
					if (msg.scheme === 'system') {
						this.schemeCookieValue = 'system';
						this.#applyDark(matchMedia('(prefers-color-scheme: dark)').matches);
						return;
					}
					if (msg.scheme === 'light' || msg.scheme === 'dark') {
						this.schemeCookieValue = msg.scheme;
						this.#applyDark(msg.scheme === 'dark');
						return;
					}
				}
				if (
					msg.kind === 'theme' &&
					typeof msg.name === 'string' &&
					Object.hasOwn(this.config.themes, msg.name)
				) {
					const name = msg.name;
					const callId = ++this.#latestCall;
					this.pendingLoads++;
					this.loadingName = name;
					loadCss(name)
						.then((css) => {
							if (callId !== this.#latestCall) return;
							this.#applyTheme(name, css);
							this.themeCookieValue = name;
						})
						.catch((err) => {
							console.error('[svelte-themes] failed to apply broadcast theme:', err);
						})
						.finally(() => {
							this.pendingLoads--;
							if (callId === this.#latestCall) this.loadingName = null;
						});
				}
			});
		}

		if (import.meta.hot) {
			import.meta.hot.dispose(() => {
				if (this.#mql && this.#mqlListener) {
					this.#mql.removeEventListener('change', this.#mqlListener);
				}
				this.#bc?.close();
			});
		}
	}
}

export const registry: Map<string, ThemeScope> = new Map();
export const matchers: Map<string, Matcher> = new Map();

// Tracks which scope was last applied to the DOM. Used by
// `applyActiveScopeOnNavigation` to detect scope changes.
let lastActiveScopeName: string | null = null;

export function registerScope(scope: ThemeScope): void {
	registry.set(scope.config.name, scope);
}

export function registerScopeMatcher(name: string, matcher: Matcher): void {
	matchers.set(name, matcher);
}

export function clearMatchers(): void {
	matchers.clear();
}

export function getScope(name: string): ThemeScope | undefined {
	return registry.get(name);
}

export function getFirstScope(): ThemeScope | undefined {
	const it = registry.values().next();
	return it.done ? undefined : it.value;
}

export function clearRegistry(): void {
	// Dispose any client-side listeners (mql + BroadcastChannel) held by the
	// scopes we're about to drop. Without this, calling `createThemes` /
	// `createScopedThemes` more than once would leak listeners — the stale
	// scope's BC would still receive messages and mutate the DOM.
	for (const scope of registry.values()) {
		scope.disposeClient();
	}
	registry.clear();
	matchers.clear();
	lastActiveScopeName = null;
}

function splitSegments(pathname: string): string[] {
	return pathname.split('/').filter((s) => s.length > 0);
}

function stringPrefixMatchLength(pattern: string, segments: string[]): number {
	const patternSegs = splitSegments(pattern);
	// Special case: pattern '/' matches every path with prefix length 0 (root catch-all).
	if (patternSegs.length === 0) return 0;
	if (patternSegs.length > segments.length) return -1;
	for (let i = 0; i < patternSegs.length; i++) {
		if (patternSegs[i] !== segments[i]) return -1;
	}
	return patternSegs.length;
}

/**
 * Match a pathname against the registered scope matchers.
 *
 * Resolution order:
 *  1. Best (longest) prefix match across string/array matchers.
 *  2. If no prefix match, first predicate matcher in declaration order.
 *  3. Otherwise `undefined` — caller falls back to the first scope.
 */
export function matchScope(pathname: string): ThemeScope | undefined {
	const segments = splitSegments(pathname);

	let bestName: string | undefined;
	let bestLen = -1;
	const predicates: string[] = [];

	for (const [name, matcher] of matchers) {
		if (typeof matcher === 'function') {
			predicates.push(name);
			continue;
		}
		const patterns = typeof matcher === 'string' ? [matcher] : matcher;
		let scopeBest = -1;
		for (const p of patterns) {
			const len = stringPrefixMatchLength(p, segments);
			if (len < 0) continue;
			if (len > scopeBest) scopeBest = len;
		}
		if (scopeBest < 0) continue;
		// Strict greater — first declared wins on ties.
		if (scopeBest > bestLen) {
			bestLen = scopeBest;
			bestName = name;
		}
	}

	if (bestName !== undefined) {
		return registry.get(bestName);
	}

	if (predicates.length > 0) {
		let url: URL | undefined;
		try {
			url = new URL(pathname, 'http://localhost');
		} catch {
			url = undefined;
		}
		if (url) {
			for (const name of predicates) {
				const m = matchers.get(name);
				if (typeof m === 'function' && m(url)) {
					return registry.get(name);
				}
			}
		}
	}

	return undefined;
}

export function getActiveScope(): ThemeScope | undefined {
	if (typeof document === 'undefined') {
		const name = getServerTheme()?.scopeName;
		if (name) {
			const matched = registry.get(name);
			if (matched) return matched;
		}
		return getFirstScope();
	}
	const matched = matchScope(window.location.pathname);
	if (matched) return matched;
	return getFirstScope();
}

// ---------------------------------------------------------------------------
// Cross-scope SPA navigation
// ---------------------------------------------------------------------------

/** Reset for tests / fresh `createScopedThemes` calls. */
export function setLastActiveScopeName(name: string | null): void {
	lastActiveScopeName = name;
}

export function getLastActiveScopeName(): string | null {
	return lastActiveScopeName;
}

/**
 * Pure decision helper: should this navigation trigger a cross-scope swap?
 *
 * Returns `true` only when the next scope is known *and* differs from the
 * previous scope. Used by `applyActiveScopeOnNavigation` so the same logic is
 * trivially unit-testable.
 */
export function shouldSwapOnNavigation(
	prevScopeName: string | null,
	nextScopeName: string | undefined | null
): boolean {
	if (!nextScopeName) return false;
	return prevScopeName !== nextScopeName;
}

/**
 * Match `pathname` against the registered scopes and, if the active scope
 * changed since last call, atomically swap themes (and scheme, for
 * independent-scheme scopes) to the new scope's state.
 *
 * Designed to be wired to SvelteKit's `afterNavigate`. No-op when no scopes
 * are registered or when the scope hasn't changed.
 */
export async function applyActiveScopeOnNavigation(
	pathname: string
): Promise<void> {
	const next = matchScope(pathname) ?? getFirstScope();
	const nextName = next?.config.name;
	if (!shouldSwapOnNavigation(lastActiveScopeName, nextName)) return;

	const previousName = lastActiveScopeName;
	lastActiveScopeName = nextName!;

	// Hand off DOM/BC listeners from old to new. The old scope's mql listener
	// would otherwise keep mutating the global `dark` class based on its own
	// scheme cookie, conflicting with the new active scope.
	if (previousName) {
		const previous = registry.get(previousName);
		if (previous && previous !== next) previous.disposeClient();
	}

	// Atomic theme swap (await-loadCss-then-apply) keeps the previous frame
	// visible until the new CSS is in hand — same no-flash guarantee as `setTheme`.
	await next!.applyScopeStateFromCookies();

	// Bind the new active scope's listeners — *only* if it's still active.
	// A rapid cross-scope navigation can change `lastActiveScopeName` while
	// our await is suspended; without this guard we'd bind listeners to a
	// scope that's no longer the active one.
	if (lastActiveScopeName === nextName) {
		next!.initClient();
	}
}

/**
 * Pure helper: enumerate the `(scopeName, themeName)` pairs whose CSS should
 * be speculatively preloaded after init. Skips the primary scope (already
 * applied). Browser-only consumers feed the result into `loadCss` on
 * `requestIdleCallback`.
 */
export function idlePreloadCandidates(
	scopes: Map<string, ThemeScope>,
	primaryScopeName: string
): Array<{ scopeName: string; themeName: string }> {
	const out: Array<{ scopeName: string; themeName: string }> = [];
	for (const [name, scope] of scopes) {
		if (name === primaryScopeName) continue;
		out.push({ scopeName: name, themeName: scope.resolveTargetThemeFromCookie() });
	}
	return out;
}
