import { buildAxisConfigs, COOKIE_NAME_RE, validateDefaultThemesKeys } from './build.js';
import {
	applyActiveScopeOnNavigation,
	clearRegistry,
	getActiveScope,
	matchScope,
	registerScope,
	registerScopeMatcher,
	setLastActiveScopeName,
	ThemeScope,
	type ThemeScopeConfig
} from './core.svelte.js';
import { normalizeThemes } from './normalize.js';
import type { Matcher, Scheme, ScopeDecl, ScopedAPI, ScopedConfig } from './types.js';

const RESERVED_KEY = 'getActiveScope';

function matchersStructurallyEqual(a: Matcher, b: Matcher): boolean {
	if (typeof a === 'function' || typeof b === 'function') return false;
	const arrA = typeof a === 'string' ? [a] : Array.from(a);
	const arrB = typeof b === 'string' ? [b] : Array.from(b);
	if (arrA.length !== arrB.length) return false;
	const sa = [...arrA].sort();
	const sb = [...arrB].sort();
	return sa.every((v, i) => v === sb[i]);
}

function buildScopeHandle(scope: ThemeScope): unknown {
	return {
		setTheme: (name: string, sch?: Scheme) => scope.setTheme(name, sch),
		getThemes: () => scope.getThemes(),
		getCurrentTheme: () => scope.getCurrentTheme(),
		getDefaultTheme: () => scope.getDefaultTheme(),
		getThemeSource: () => scope.getThemeSource(),
		isLoadingTheme: (name?: string) => scope.isLoadingTheme(name),
		getLoadingTheme: () => scope.getLoadingTheme()
	};
}

export function createScopedThemes<const S extends Record<string, ScopeDecl>>(
	config: ScopedConfig<S>
): ScopedAPI<S> {
	const scopeEntries = Object.entries(config.scopes) as [string, ScopeDecl][];
	if (scopeEntries.length === 0) {
		throw new Error('createScopedThemes: scopes must not be empty');
	}

	const cookieTheme = config.cookieTheme ?? 'theme';
	const cookieScheme = config.cookieScheme ?? 'scheme';
	if (!COOKIE_NAME_RE.test(cookieTheme)) {
		throw new Error(`createScopedThemes: cookieTheme "${cookieTheme}" must match ${COOKIE_NAME_RE}`);
	}
	if (!COOKIE_NAME_RE.test(cookieScheme)) {
		throw new Error(
			`createScopedThemes: cookieScheme "${cookieScheme}" must match ${COOKIE_NAME_RE}`
		);
	}
	if (cookieTheme === cookieScheme) {
		throw new Error(
			`createScopedThemes: cookieTheme and cookieScheme must differ ("${cookieTheme}")`
		);
	}

	const topDefaultScheme: Scheme = config.defaultScheme ?? 'system';
	const sharedScheme = config.sharedScheme ?? true;
	const syncTabs = config.syncTabs ?? true;
	const syncChannel = config.syncChannel ?? 'svelte-themes';

	type Resolved = { name: string; decl: ScopeDecl; scopeConfig: ThemeScopeConfig };
	const resolved: Resolved[] = [];
	const allThemeCookies = new Map<string, string>(); // cookieName -> scope (collision detection)
	const schemeCookies = new Set<string>(); // every distinct scheme cookie name

	for (const [name, decl] of scopeEntries) {
		const label = `createScopedThemes: scope "${name}"`;
		if (name === RESERVED_KEY) {
			throw new Error(`createScopedThemes: scope name "${RESERVED_KEY}" is reserved`);
		}
		if (!COOKIE_NAME_RE.test(name)) {
			throw new Error(`${label}: name must match ${COOKIE_NAME_RE}`);
		}

		const norm = normalizeThemes(decl.themes as Record<string, unknown>, label);
		const defaultThemes = decl.defaultThemes as Record<string, string> | undefined;
		validateDefaultThemesKeys(norm, defaultThemes, label);

		const axes = buildAxisConfigs({
			scopeName: name,
			scopeSegment: name,
			norm,
			defaultTheme: decl.defaultTheme as string | undefined,
			defaultThemes,
			cookieTheme,
			label
		});

		for (const axis of axes) {
			const prev = allThemeCookies.get(axis.cookieName);
			if (prev !== undefined) {
				throw new Error(
					`createScopedThemes: scopes "${prev}" and "${name}" derive the same cookie "${axis.cookieName}"`
				);
			}
			allThemeCookies.set(axis.cookieName, name);
		}

		// Scheme: sharedScheme master switch.
		const independentScheme = !sharedScheme;
		const scopeCookieScheme = sharedScheme ? cookieScheme : `${cookieScheme}-${name}`;
		schemeCookies.add(scopeCookieScheme);
		const scopeDefaultScheme = sharedScheme
			? topDefaultScheme
			: ((decl.defaultScheme as Scheme | undefined) ?? topDefaultScheme);

		resolved.push({
			name,
			decl,
			scopeConfig: {
				name,
				flat: norm.flat,
				axes,
				defaultScheme: scopeDefaultScheme,
				cookieScheme: scopeCookieScheme,
				independentScheme,
				syncTabs,
				syncChannel
			}
		});
	}

	// A scheme cookie must not collide with any theme cookie (possible via a
	// hyphenated `cookieScheme` + a scope/axis whose theme cookie derives the
	// same name). Scheme-vs-scheme can't collide (shared = one cookie;
	// independent = unique `${cookieScheme}-${scope}`).
	for (const sc of schemeCookies) {
		const themeScope = allThemeCookies.get(sc);
		if (themeScope !== undefined) {
			throw new Error(
				`createScopedThemes: scheme cookie "${sc}" collides with scope "${themeScope}"'s theme cookie`
			);
		}
	}

	// Cross-scope: duplicate match patterns.
	for (let i = 0; i < resolved.length; i++) {
		for (let j = i + 1; j < resolved.length; j++) {
			if (matchersStructurallyEqual(resolved[i].decl.match, resolved[j].decl.match)) {
				throw new Error(
					`createScopedThemes: scopes "${resolved[i].name}" and "${resolved[j].name}" have identical match patterns`
				);
			}
		}
	}

	clearRegistry();

	const scopeInstances: Record<string, ThemeScope> = {};
	for (const r of resolved) {
		const scope = new ThemeScope(r.scopeConfig);
		registerScope(scope);
		registerScopeMatcher(r.name, r.decl.match);
		scopeInstances[r.name] = scope;
	}

	const first = resolved[0];
	const initialScope =
		(typeof window !== 'undefined' ? matchScope(window.location.pathname) : undefined) ??
		scopeInstances[first.name];

	// Seed every non-active scope's state so its handle reads correctly even
	// while another scope is the one bound to the DOM.
	for (const r of resolved) {
		const scope = scopeInstances[r.name];
		if (scope !== initialScope) scope.seedStateFromCookies();
	}
	initialScope.initClient();
	setLastActiveScopeName(initialScope.config.name);

	// Cross-scope SPA navigation. afterNavigate requires a component init
	// context; guard + lazy-import so SSR/test/non-SvelteKit consumers no-op.
	if (typeof window !== 'undefined') {
		void import('$app/navigation')
			.then(({ afterNavigate }) => {
				try {
					afterNavigate(({ to }) => {
						if (!to) return;
						void applyActiveScopeOnNavigation(to.url.pathname);
					});
				} catch {
					/* outside component init — ignore */
				}
			})
			.catch(() => {
				/* $app/navigation unavailable — ignore */
			});
	}

	const api: Record<string, unknown> = {};
	for (const r of resolved) api[r.name] = buildScopeHandle(scopeInstances[r.name]);
	// Resolve via core's getActiveScope so SSR reads the request's matched scope
	// (from ALS), not just the first one.
	api[RESERVED_KEY] = (): string => getActiveScope()?.config.name ?? first.name;

	return api as ScopedAPI<S>;
}
