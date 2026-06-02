import { loadCss, setConfig } from './config.js';
import {
	applyActiveScopeOnNavigation,
	clearRegistry,
	idlePreloadCandidates,
	registerScope,
	registerScopeMatcher,
	registry,
	matchScope,
	setLastActiveScopeName,
	ThemeScope,
	type ThemeScopeConfig
} from './core.svelte.js';
import type {
	Matcher,
	Scheme,
	ScopeDecl,
	ScopedAPI,
	ScopedConfig,
	ThemeLoader,
	ThemesAPI
} from './types.js';

const COOKIE_NAME_RE = /^[A-Za-z0-9_-]+$/;
const RESERVED_KEY = 'getActiveScope';

function matchersStructurallyEqual(a: Matcher, b: Matcher): boolean {
	if (typeof a === 'function' || typeof b === 'function') return false;
	const arrA = typeof a === 'string' ? [a] : Array.from(a);
	const arrB = typeof b === 'string' ? [b] : Array.from(b);
	if (arrA.length !== arrB.length) return false;
	const sortedA = [...arrA].sort();
	const sortedB = [...arrB].sort();
	return sortedA.every((v, i) => v === sortedB[i]);
}

function buildScopeHandle<T extends Record<string, ThemeLoader>>(
	scope: ThemeScope
): ThemesAPI<T> {
	return {
		setTheme: (name, scheme) => scope.setTheme(name as string, scheme),
		getThemes: () => scope.getThemes() as (keyof T & string)[],
		getCurrentTheme: () => scope.getCurrentTheme() as keyof T & string,
		getDefaultTheme: () => scope.getDefaultTheme() as keyof T & string,
		isLoadingTheme: (name) => scope.isLoadingTheme(name as string | undefined),
		getLoadingTheme: () => scope.getLoadingTheme() as (keyof T & string) | null
	};
}

export function createScopedThemes<
	const T extends Record<string, ThemeLoader>,
	const S extends Record<string, ScopeDecl<T>>
>(config: ScopedConfig<T, S>): ScopedAPI<T, S> {
	// --- Top-level validation ----------------------------------------------
	const topThemeNames = Object.keys(config.themes);
	if (topThemeNames.length === 0) {
		throw new Error('createScopedThemes: no themes provided');
	}

	const scopeEntries = Object.entries(config.scopes) as [string, ScopeDecl<T>][];
	if (scopeEntries.length === 0) {
		throw new Error('createScopedThemes: scopes must not be empty');
	}

	const topCookieScheme = config.cookieScheme ?? 'scheme';
	if (!COOKIE_NAME_RE.test(topCookieScheme)) {
		throw new Error(
			`createScopedThemes: cookieScheme "${topCookieScheme}" must match ${COOKIE_NAME_RE}`
		);
	}

	const topDefaultScheme: Scheme = config.defaultScheme ?? 'system';
	const sharedScheme = config.sharedScheme ?? true;
	const syncTabs = config.syncTabs ?? true;
	const syncChannel = config.syncChannel ?? 'svelte-themes';

	// --- Per-scope validation + cookie derivation --------------------------
	type Resolved = {
		name: string;
		decl: ScopeDecl<T>;
		themes: Record<string, ThemeLoader>;
		defaultTheme: string;
		defaultScheme: Scheme;
		cookieTheme: string;
		cookieScheme: string;
		hasOwnScheme: boolean;
	};

	const resolved: Resolved[] = [];

	for (const [name, decl] of scopeEntries) {
		if (name === RESERVED_KEY) {
			throw new Error(
				`createScopedThemes: scope name "${RESERVED_KEY}" is reserved`
			);
		}

		let scopeThemes: Record<string, ThemeLoader>;
		if (decl.themes && decl.themes.length > 0) {
			scopeThemes = {};
			for (const k of decl.themes) {
				if (!Object.hasOwn(config.themes, k)) {
					throw new Error(
						`createScopedThemes: scope "${name}" references unknown theme "${String(k)}"`
					);
				}
				scopeThemes[k as string] = config.themes[k as keyof T];
			}
		} else {
			scopeThemes = config.themes as Record<string, ThemeLoader>;
		}

		const defaultTheme = decl.defaultTheme as string;
		if (!Object.hasOwn(scopeThemes, defaultTheme)) {
			throw new Error(
				`createScopedThemes: scope "${name}" defaultTheme "${defaultTheme}" not in its themes`
			);
		}

		// A scope owns its scheme when it declares its own scheme field, OR when
		// `sharedScheme: false` flips the baseline so every scope is independent.
		const declaredOwnScheme =
			decl.defaultScheme !== undefined || decl.cookieScheme !== undefined;
		const hasOwnScheme = declaredOwnScheme || !sharedScheme;

		const cookieTheme = decl.cookieTheme ?? `${name}-theme`;
		if (!COOKIE_NAME_RE.test(cookieTheme)) {
			throw new Error(
				`createScopedThemes: scope "${name}" cookieTheme "${cookieTheme}" must match ${COOKIE_NAME_RE}`
			);
		}

		let cookieScheme: string;
		if (hasOwnScheme) {
			cookieScheme = decl.cookieScheme ?? `${name}-${topCookieScheme}`;
			if (!COOKIE_NAME_RE.test(cookieScheme)) {
				throw new Error(
					`createScopedThemes: scope "${name}" cookieScheme "${cookieScheme}" must match ${COOKIE_NAME_RE}`
				);
			}
		} else {
			cookieScheme = topCookieScheme;
		}

		const defaultScheme: Scheme = decl.defaultScheme ?? topDefaultScheme;

		resolved.push({
			name,
			decl,
			themes: scopeThemes,
			defaultTheme,
			defaultScheme,
			cookieTheme,
			cookieScheme,
			hasOwnScheme
		});
	}

	// --- Cross-scope validation -------------------------------------------
	for (let i = 0; i < resolved.length; i++) {
		for (let j = i + 1; j < resolved.length; j++) {
			const a = resolved[i];
			const b = resolved[j];

			if (matchersStructurallyEqual(a.decl.match, b.decl.match)) {
				throw new Error(
					`createScopedThemes: scopes "${a.name}" and "${b.name}" have identical match patterns`
				);
			}

			if (a.cookieTheme === b.cookieTheme) {
				throw new Error(
					`createScopedThemes: scopes "${a.name}" and "${b.name}" share cookieTheme "${a.cookieTheme}"`
				);
			}

			// cookieScheme collisions matter only between scopes that own one.
			// (Scopes without an independent scheme intentionally share the top-level one.)
			if (a.hasOwnScheme && b.hasOwnScheme && a.cookieScheme === b.cookieScheme) {
				throw new Error(
					`createScopedThemes: scopes "${a.name}" and "${b.name}" share cookieScheme "${a.cookieScheme}"`
				);
			}
		}
	}

	// --- Register ----------------------------------------------------------
	clearRegistry();

	// Seed the singleton config with the full top-level themes record so
	// `loadCss(name)` (which looks up loaders via `getConfig().themes`) can
	// resolve any registered theme regardless of which scope is active. The
	// other fields aren't read in scoped mode — they're set to the first
	// scope's values just so the resolved-config shape stays valid.
	const first = resolved[0];
	setConfig({
		themes: config.themes,
		defaultTheme: first.defaultTheme,
		defaultScheme: first.defaultScheme,
		cookieTheme: first.cookieTheme,
		cookieScheme: first.cookieScheme,
		syncTabs,
		syncChannel
	});

	const scopeInstances: Record<string, ThemeScope> = {};

	for (const r of resolved) {
		const scopeConfig: ThemeScopeConfig = {
			name: r.name,
			themes: r.themes,
			defaultTheme: r.defaultTheme,
			defaultScheme: r.defaultScheme,
			cookieTheme: r.cookieTheme,
			cookieScheme: r.cookieScheme,
			independentScheme: r.hasOwnScheme,
			syncTabs,
			syncChannel
		};
		const scope = new ThemeScope(scopeConfig);
		registerScope(scope);
		registerScopeMatcher(r.name, r.decl.match);
		scopeInstances[r.name] = scope;
	}

	// Pick the *route-matched* scope as the initial active one — not the
	// first-declared. If the user lands directly on /admin, the admin scope's
	// state must be the one bound to the DOM (mql + BC listeners). The first
	// scope is only used as the fallback when no route matches.
	const initialScope =
		(typeof window !== 'undefined' ? matchScope(window.location.pathname) : undefined) ??
		scopeInstances[first.name];

	// Seed every *non-active* scope's reactive state from its own cookies.
	// Without this, non-active scopes' state stays null and
	// `themes.foo.getCurrentTheme()` would fall back to
	// `document.documentElement.dataset.theme` — the *active* scope's theme,
	// not theirs. The active scope is seeded by `initClient` below.
	for (const r of resolved) {
		const scope = scopeInstances[r.name];
		if (scope !== initialScope) scope.seedStateFromCookies();
	}

	// Only the active scope binds DOM listeners (mql + BC). `initClient` also
	// seeds its own state via `seedStateFromCookies` internally. Cross-scope SPA
	// navigation is handled below via SvelteKit's `afterNavigate`.
	initialScope.initClient();
	setLastActiveScopeName(initialScope.config.name);

	// --- Cross-scope SPA navigation + idle preload --------------------------
	// Browser-only. `afterNavigate` requires a component init context, so this
	// runs only when `createScopedThemes` is called from a module imported by
	// a Svelte component (the normal usage pattern). Tests in node skip both.
	if (typeof window !== 'undefined') {
		// Speculative CSS preload for the other scopes' resolved themes — keeps
		// the first cross-scope hop flash-free without any user wait. Skip the
		// active scope (its CSS is already inlined / loaded).
		const candidates = idlePreloadCandidates(registry, initialScope.config.name);
		const idle =
			typeof window.requestIdleCallback === 'function'
				? window.requestIdleCallback.bind(window)
				: (cb: () => void): number =>
						setTimeout(cb, 0) as unknown as number;
		idle(() => {
			for (const c of candidates) {
				loadCss(c.themeName).catch(() => {
					// fire-and-forget: idle warm-up; real load will retry on demand
				});
			}
		});

		// Lazy-require so SSR bundles don't drag SvelteKit's client into shared
		// code paths. `afterNavigate` no-ops outside a component context, so we
		// guard with a try/catch to keep tests resilient.
		void import('$app/navigation')
			.then(({ afterNavigate }) => {
				try {
					afterNavigate(({ to }) => {
						if (!to) return;
						void applyActiveScopeOnNavigation(to.url.pathname);
					});
				} catch {
					// outside-component / unsupported environment — ignore
				}
			})
			.catch(() => {
				// $app/navigation unavailable (non-SvelteKit consumer) — ignore
			});
	}

	// --- Build the public API --------------------------------------------
	const api: Record<string, unknown> = {};
	for (const r of resolved) {
		api[r.name] = buildScopeHandle(scopeInstances[r.name]);
	}
	api[RESERVED_KEY] = (): string => {
		if (typeof window !== 'undefined') {
			const matched = matchScope(window.location.pathname);
			if (matched) return matched.config.name;
		}
		return first.name;
	};

	return api as ScopedAPI<T, S>;
}
