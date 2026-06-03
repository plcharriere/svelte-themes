import { loadCss } from './config.js';
import { getServerTheme } from './ssr-store.js';
import type { Matcher, Scheme, ThemeLoader } from './types.js';

/**
 * Sentinel scope value used by shared-scheme broadcasts so scopes which don't
 * own their scheme can still react to each other's scheme changes. Real scope
 * names match `^[A-Za-z0-9_-]+$`, so the `@` prefix guarantees no collision.
 */
export const SHARED_SCHEME_SCOPE = '@shared';

export type SyncMessage =
	| { kind: 'theme'; scope: string; axis: string; name: string }
	| { kind: 'scheme'; scope: string; scheme: Scheme };

type SchemeCookieValue = Scheme | null;

/** One axis of a scope: its own themes, `<style>` element, and theme cookie. */
export type AxisConfig = {
	name: string;
	themes: Record<string, ThemeLoader>;
	defaultTheme: string;
	styleId: string; // 'svelte-themes' (flat) | 'svelte-themes-${name}' (axed)
	cookieName: string; // fully derived theme cookie name
	cacheKeyPrefix: string; // `${scopeName}/${axisName}` for the loadCss cache key
};

export type ThemeScopeConfig = {
	name: string;
	flat: boolean; // single anonymous axis → string returns, no axis segment in cookies/ids
	axes: AxisConfig[];
	defaultScheme: Scheme;
	cookieScheme: string;
	independentScheme: boolean;
	syncTabs: boolean;
	syncChannel: string;
};

// ---------------------------------------------------------------------------
// Sync-message helpers (pure, unit-testable)
// ---------------------------------------------------------------------------

export function buildSyncMessage(
	kind: 'theme',
	scopeName: string,
	independentScheme: boolean,
	payload: { axis: string; name: string }
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
	payload: { axis: string; name: string } | { scheme: Scheme }
): SyncMessage {
	if (kind === 'theme') {
		const p = payload as { axis: string; name: string };
		return { kind: 'theme', scope: scopeName, axis: p.axis, name: p.name };
	}
	const tag = independentScheme ? scopeName : SHARED_SCHEME_SCOPE;
	return { kind: 'scheme', scope: tag, scheme: (payload as { scheme: Scheme }).scheme };
}

/**
 * Should this scope act on an incoming sync message?
 * - theme: scope tag matches the receiver (axis validity checked by the handler).
 * - scheme + independent receiver: scope tag matches.
 * - scheme + shared receiver: tagged `@shared`.
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

// ---------------------------------------------------------------------------
// ThemeAxis — one axis's reactive theme state + <style> element + cookie
// ---------------------------------------------------------------------------

export class ThemeAxis {
	readonly config: AxisConfig;

	themeState = $state<string | null>(null);
	themeCookieValue = $state<string | null>(null);
	pendingLoads = $state<number>(0);
	loadingName = $state<string | null>(null);

	#latestCall = 0;

	constructor(config: AxisConfig) {
		this.config = config;
	}

	has(name: string): boolean {
		return Object.hasOwn(this.config.themes, name);
	}

	names(): string[] {
		return Object.keys(this.config.themes);
	}

	#cacheKey(name: string): string {
		return `${this.config.cacheKeyPrefix}/${name}`;
	}

	#readCookie(): string | null {
		const re = new RegExp(`(?:^|;\\s*)${regexEscape(this.config.cookieName)}=([^;]*)`);
		const m = document.cookie.match(re);
		if (!m) return null;
		const v = decodeURIComponent(m[1]);
		return this.has(v) ? v : null;
	}

	#setCookie(value: string): void {
		const secure = location.protocol === 'https:' ? '; Secure' : '';
		document.cookie = `${this.config.cookieName}=${encodeURIComponent(value)}; path=/; max-age=31536000; SameSite=Lax${secure}`;
	}

	#applyCss(css: string): void {
		let style = document.getElementById(this.config.styleId) as HTMLStyleElement | null;
		if (!style) {
			style = document.createElement('style');
			style.id = this.config.styleId;
			document.head.appendChild(style);
		}
		style.textContent = css;
	}

	removeStyleEl(): void {
		document.getElementById(this.config.styleId)?.remove();
	}

	/** Theme this axis should be on, from its cookie (if valid) or its default. */
	resolveTarget(): string {
		if (typeof document === 'undefined') return this.config.defaultTheme;
		return this.#readCookie() ?? this.config.defaultTheme;
	}

	/** Seed reactive state from the cookie only — no DOM, no listeners. Browser-only. */
	seedFromCookie(): void {
		if (typeof document === 'undefined') return;
		this.themeCookieValue = this.#readCookie();
		this.themeState = this.themeCookieValue ?? this.config.defaultTheme;
	}

	/** Whether this axis's `<style>` element already has content (SSR-injected). */
	hasRenderedCss(): boolean {
		if (typeof document === 'undefined') return false;
		const el = document.getElementById(this.config.styleId);
		return !!el && !!el.textContent;
	}

	getCurrent(): string {
		if (typeof document === 'undefined') {
			return getServerTheme()?.themes[this.config.name]?.name ?? this.config.defaultTheme;
		}
		return this.themeState ?? this.config.defaultTheme;
	}

	getSource(): 'cookie' | 'default' {
		if (typeof document === 'undefined') {
			return getServerTheme()?.themes[this.config.name]?.source ?? 'default';
		}
		return this.themeCookieValue === null ? 'default' : 'cookie';
	}

	isLoading(): boolean {
		return this.pendingLoads > 0;
	}

	/** Load + apply a theme. Writes the cookie when `writeCookie` (user action). */
	async apply(name: string, writeCookie: boolean): Promise<void> {
		const callId = ++this.#latestCall;
		this.pendingLoads++;
		this.loadingName = name;
		try {
			const css = await loadCss(this.#cacheKey(name), this.config.themes[name]);
			if (callId !== this.#latestCall) return;
			this.#applyCss(css);
			if (writeCookie) {
				this.#setCookie(name);
				this.themeCookieValue = name;
			}
			this.themeState = name;
		} finally {
			this.pendingLoads--;
			if (callId === this.#latestCall) this.loadingName = null;
		}
	}

	/** Apply the axis's current target (cookie or default) without writing a cookie. */
	async applyFromCookie(): Promise<void> {
		if (typeof document === 'undefined') return;
		const cookie = this.#readCookie();
		const target = cookie ?? this.config.defaultTheme;
		const callId = ++this.#latestCall;
		this.pendingLoads++;
		this.loadingName = target;
		try {
			const css = await loadCss(this.#cacheKey(target), this.config.themes[target]);
			if (callId !== this.#latestCall) return;
			this.#applyCss(css);
			this.themeCookieValue = cookie;
			this.themeState = target;
		} finally {
			this.pendingLoads--;
			if (callId === this.#latestCall) this.loadingName = null;
		}
	}
}

// ---------------------------------------------------------------------------
// ThemeScope — a set of axes + scheme state + cross-tab/listener wiring
// ---------------------------------------------------------------------------

export class ThemeScope {
	readonly config: ThemeScopeConfig;
	readonly #axes: Map<string, ThemeAxis>;

	darkState = $state<boolean | null>(null);
	schemeCookieValue = $state<SchemeCookieValue>(null);

	#bc: BroadcastChannel | null = null;
	#mql: MediaQueryList | null = null;
	#mqlListener: ((e: MediaQueryListEvent) => void) | null = null;

	constructor(config: ThemeScopeConfig) {
		this.config = config;
		this.#axes = new Map(config.axes.map((a) => [a.name, new ThemeAxis(a)]));
	}

	get axes(): Map<string, ThemeAxis> {
		return this.#axes;
	}

	#defaultAxis(): ThemeAxis {
		// Flat scope has exactly one axis.
		return this.#axes.values().next().value as ThemeAxis;
	}

	#axisOwning(name: string): ThemeAxis | undefined {
		for (const axis of this.#axes.values()) {
			if (axis.has(name)) return axis;
		}
		return undefined;
	}

	// --- theme reads (flat → scalar, axed → per-axis object) ----------------

	getThemes(): string[] | Record<string, string[]> {
		if (this.config.flat) return this.#defaultAxis().names();
		const out: Record<string, string[]> = {};
		for (const [name, axis] of this.#axes) out[name] = axis.names();
		return out;
	}

	getCurrentTheme(): string | Record<string, string> {
		if (this.config.flat) return this.#defaultAxis().getCurrent();
		const out: Record<string, string> = {};
		for (const [name, axis] of this.#axes) out[name] = axis.getCurrent();
		return out;
	}

	getDefaultTheme(): string | Record<string, string> {
		if (this.config.flat) return this.#defaultAxis().config.defaultTheme;
		const out: Record<string, string> = {};
		for (const [name, axis] of this.#axes) out[name] = axis.config.defaultTheme;
		return out;
	}

	getThemeSource(): ('cookie' | 'default') | Record<string, 'cookie' | 'default'> {
		if (this.config.flat) return this.#defaultAxis().getSource();
		const out: Record<string, 'cookie' | 'default'> = {};
		for (const [name, axis] of this.#axes) out[name] = axis.getSource();
		return out;
	}

	isLoadingTheme(name?: string): boolean {
		if (name === undefined) {
			for (const axis of this.#axes.values()) if (axis.isLoading()) return true;
			return false;
		}
		const axis = this.#axisOwning(name);
		return axis ? axis.loadingName === name : false;
	}

	getLoadingTheme(): string | null | Record<string, string> {
		if (this.config.flat) return this.#defaultAxis().loadingName;
		const out: Record<string, string> = {};
		for (const [name, axis] of this.#axes) {
			if (axis.loadingName !== null) out[name] = axis.loadingName;
		}
		return out;
	}

	// --- theme writes -------------------------------------------------------

	async setTheme(name: string, scheme?: Scheme): Promise<void> {
		if (typeof document === 'undefined') return;
		const axis = this.#axisOwning(name);
		if (!axis) throw new Error(`Unknown theme: ${name}`);
		await axis.apply(name, true);
		this.#bc?.postMessage(
			buildSyncMessage('theme', this.config.name, this.config.independentScheme, {
				axis: axis.config.name,
				name
			})
		);
		if (scheme !== undefined) this.setScheme(scheme);
	}

	// --- scheme (unchanged semantics; state lives on the scope) -------------

	#readSchemeCookie(): SchemeCookieValue {
		const re = new RegExp(`(?:^|;\\s*)${regexEscape(this.config.cookieScheme)}=([^;]*)`);
		const m = document.cookie.match(re);
		if (!m) return null;
		const v = decodeURIComponent(m[1]);
		if (v === 'light' || v === 'dark' || v === 'system') return v;
		return null;
	}

	#setSchemeCookie(value: string): void {
		const secure = location.protocol === 'https:' ? '; Secure' : '';
		document.cookie = `${this.config.cookieScheme}=${encodeURIComponent(value)}; path=/; max-age=31536000; SameSite=Lax${secure}`;
	}

	#applyDark(dark: boolean): void {
		document.documentElement.classList.toggle('dark', dark);
		this.darkState = dark;
	}

	#seedSchemeFromCookie(): void {
		this.schemeCookieValue = this.#readSchemeCookie();
		const c = this.schemeCookieValue;
		if (c === 'dark') this.darkState = true;
		else if (c === 'light') this.darkState = false;
		else if (c === 'system') this.darkState = matchMedia('(prefers-color-scheme: dark)').matches;
		else if (this.config.defaultScheme === 'system')
			this.darkState = matchMedia('(prefers-color-scheme: dark)').matches;
		else this.darkState = this.config.defaultScheme === 'dark';
	}

	#applySchemeFromCookie(): void {
		this.schemeCookieValue = this.#readSchemeCookie();
		const c = this.schemeCookieValue;
		if (c === 'system') this.#applyDark(matchMedia('(prefers-color-scheme: dark)').matches);
		else if (c === 'dark') this.#applyDark(true);
		else if (c === 'light') this.#applyDark(false);
		else if (this.config.defaultScheme === 'system')
			this.#applyDark(matchMedia('(prefers-color-scheme: dark)').matches);
		else this.#applyDark(this.config.defaultScheme === 'dark');
	}

	isDark(): boolean {
		if (typeof document === 'undefined') {
			const ss = getServerTheme();
			if (ss) return ss.dark;
			return this.config.defaultScheme === 'dark';
		}
		return this.darkState ?? document.documentElement.classList.contains('dark');
	}

	getScheme(): Scheme {
		if (typeof document === 'undefined') {
			const ss = getServerTheme();
			if (ss) return ss.scheme;
			return this.config.defaultScheme;
		}
		if (this.schemeCookieValue !== null) return this.schemeCookieValue;
		return this.config.defaultScheme;
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
		if (scheme === 'system') {
			this.#setSchemeCookie('system');
			this.schemeCookieValue = 'system';
			this.#applyDark(matchMedia('(prefers-color-scheme: dark)').matches);
		} else {
			this.#applyDark(scheme === 'dark');
			this.#setSchemeCookie(scheme);
			this.schemeCookieValue = scheme;
		}
		this.#bc?.postMessage(
			buildSyncMessage('scheme', this.config.name, this.config.independentScheme, { scheme })
		);
	}

	toggleScheme(): void {
		this.setScheme(this.isDark() ? 'light' : 'dark');
	}

	// --- lifecycle ----------------------------------------------------------

	/** Seed all axes' + scheme state from cookies (no DOM apply, no listeners). */
	seedStateFromCookies(): void {
		if (typeof document === 'undefined') return;
		for (const axis of this.#axes.values()) axis.seedFromCookie();
		this.#seedSchemeFromCookie();
	}

	/**
	 * Re-read cookies and apply this scope's full state to the DOM atomically:
	 * each axis's CSS + the `dark` class. Used on cross-scope navigation —
	 * loads run first, the current frame stays visible until applied.
	 */
	async applyStateFromCookies(): Promise<void> {
		if (typeof document === 'undefined') return;
		await Promise.all([...this.#axes.values()].map((a) => a.applyFromCookie()));
		this.#applySchemeFromCookie();
	}

	#bcMessage = (e: MessageEvent): void => {
		const msg = e.data as SyncMessage | null;
		if (!msg || typeof msg !== 'object' || typeof msg.scope !== 'string') return;
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
			} else if (msg.scheme === 'light' || msg.scheme === 'dark') {
				this.schemeCookieValue = msg.scheme;
				this.#applyDark(msg.scheme === 'dark');
			}
			return;
		}
		const axis = this.#axes.get(msg.axis);
		if (axis && axis.has(msg.name)) {
			axis.apply(msg.name, false).catch((err) => {
				console.error('[svelte-themes] failed to apply broadcast theme:', err);
			});
		}
	};

	disposeClient(): void {
		if (this.#mql && this.#mqlListener) this.#mql.removeEventListener('change', this.#mqlListener);
		this.#mql = null;
		this.#mqlListener = null;
		this.#bc?.removeEventListener('message', this.#bcMessage);
		this.#bc?.close();
		this.#bc = null;
	}

	initClient(): void {
		if (typeof window === 'undefined') return;

		this.disposeClient();
		this.seedStateFromCookies();

		// Apply any axis whose <style> wasn't server-injected (e.g. axed mode
		// before the server injects per-axis CSS). Flat mode's element is already
		// filled by SSR, so this is skipped there — no redundant load, no flash.
		for (const axis of this.#axes.values()) {
			if (!axis.hasRenderedCss()) void axis.applyFromCookie();
		}

		this.#mql = matchMedia('(prefers-color-scheme: dark)');
		this.#mqlListener = (e) => {
			const c = this.#readSchemeCookie();
			if (c === 'system' || (c === null && this.config.defaultScheme === 'system')) {
				this.#applyDark(e.matches);
			}
		};
		this.#mql.addEventListener('change', this.#mqlListener);

		if (this.config.syncTabs) {
			this.#bc = new BroadcastChannel(this.config.syncChannel);
			this.#bc.addEventListener('message', this.#bcMessage);
		}

		if (import.meta.hot) {
			import.meta.hot.dispose(() => this.disposeClient());
		}
	}
}

// ---------------------------------------------------------------------------
// Registry + scope matching
// ---------------------------------------------------------------------------

export const registry: Map<string, ThemeScope> = new Map();
export const matchers: Map<string, Matcher> = new Map();

let lastActiveScopeName: string | null = null;

export function registerScope(scope: ThemeScope): void {
	registry.set(scope.config.name, scope);
}

export function registerScopeMatcher(name: string, matcher: Matcher): void {
	matchers.set(name, matcher);
}

export function getScope(name: string): ThemeScope | undefined {
	return registry.get(name);
}

export function getFirstScope(): ThemeScope | undefined {
	const it = registry.values().next();
	return it.done ? undefined : it.value;
}

export function clearRegistry(): void {
	for (const scope of registry.values()) scope.disposeClient();
	registry.clear();
	matchers.clear();
	lastActiveScopeName = null;
}

function splitSegments(pathname: string): string[] {
	return pathname.split('/').filter((s) => s.length > 0);
}

function stringPrefixMatchLength(pattern: string, segments: string[]): number {
	const patternSegs = splitSegments(pattern);
	if (patternSegs.length === 0) return 0; // '/' — root catch-all, length 0
	if (patternSegs.length > segments.length) return -1;
	for (let i = 0; i < patternSegs.length; i++) {
		if (patternSegs[i] !== segments[i]) return -1;
	}
	return patternSegs.length;
}

/**
 * Match a pathname against registered scope matchers.
 *  1. Longest prefix wins across string/array matchers (first declared on ties).
 *  2. Else first predicate matcher in declaration order.
 *  3. Else `undefined` — caller falls back to the first scope.
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
			if (len > scopeBest) scopeBest = len;
		}
		if (scopeBest < 0) continue;
		if (scopeBest > bestLen) {
			bestLen = scopeBest;
			bestName = name;
		}
	}

	if (bestName !== undefined) return registry.get(bestName);

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
				if (typeof m === 'function' && m(url)) return registry.get(name);
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
	return matchScope(window.location.pathname) ?? getFirstScope();
}

// ---------------------------------------------------------------------------
// Cross-scope SPA navigation
// ---------------------------------------------------------------------------

export function setLastActiveScopeName(name: string | null): void {
	lastActiveScopeName = name;
}

export function getLastActiveScopeName(): string | null {
	return lastActiveScopeName;
}

export function shouldSwapOnNavigation(
	prevScopeName: string | null,
	nextScopeName: string | undefined | null
): boolean {
	if (!nextScopeName) return false;
	return prevScopeName !== nextScopeName;
}

/**
 * On cross-scope navigation: hand off the whole active scope. Dispose the old
 * scope's listeners, diff its axis `<style>` elements against the new scope's
 * (remove the ones the new scope doesn't have — shared ids are reused and
 * updated by `applyStateFromCookies`), apply the new scope's state (axes +
 * scheme) atomically, then bind the new scope's listeners.
 */
export async function applyActiveScopeOnNavigation(pathname: string): Promise<void> {
	const next = matchScope(pathname) ?? getFirstScope();
	const nextName = next?.config.name;
	if (!shouldSwapOnNavigation(lastActiveScopeName, nextName)) return;

	const previousName = lastActiveScopeName;
	lastActiveScopeName = nextName!;

	if (previousName) {
		const previous = registry.get(previousName);
		if (previous && previous !== next) {
			previous.disposeClient();
			// Remove style elements for axes the new scope doesn't have.
			const nextIds = new Set([...next!.axes.values()].map((a) => a.config.styleId));
			for (const axis of previous.axes.values()) {
				if (!nextIds.has(axis.config.styleId)) axis.removeStyleEl();
			}
		}
	}

	await next!.applyStateFromCookies();

	// Guard against a rapid second navigation having moved on while we awaited.
	if (lastActiveScopeName === nextName) next!.initClient();
}
