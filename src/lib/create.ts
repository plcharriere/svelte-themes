import { buildAxisConfigs, COOKIE_NAME_RE, validateDefaultThemesKeys } from './build.js';
import { clearRegistry, registerScope, ThemeScope, type ThemeScopeConfig } from './core.svelte.js';
import { normalizeThemes } from './normalize.js';
import type { Scheme, ThemeLoader, ThemesAPI, ThemesConfig } from './types.js';

const FLAT_SCOPE_NAME = 'default';

/**
 * Register a single themes system (one implicit, always-active scope). `themes`
 * may be flat (`{ name: loader }`), axed (`{ axis: { name: loader } }`), or
 * mixed. For per-section theming use `createScopedThemes`.
 */
export function createThemes<const T extends Record<string, unknown>>(
	options: ThemesConfig<T>
): ThemesAPI<T> {
	const norm = normalizeThemes(options.themes as Record<string, unknown>, 'createThemes');

	const cookieTheme = options.cookieTheme ?? 'theme';
	const cookieScheme = options.cookieScheme ?? 'scheme';
	if (!COOKIE_NAME_RE.test(cookieTheme)) {
		throw new Error(`createThemes: cookieTheme "${cookieTheme}" must match ${COOKIE_NAME_RE}`);
	}
	if (!COOKIE_NAME_RE.test(cookieScheme)) {
		throw new Error(`createThemes: cookieScheme "${cookieScheme}" must match ${COOKIE_NAME_RE}`);
	}
	if (cookieTheme === cookieScheme) {
		throw new Error(`createThemes: cookieTheme and cookieScheme must differ ("${cookieTheme}")`);
	}

	const defaultThemes = options.defaultThemes as Record<string, string> | undefined;
	validateDefaultThemesKeys(norm, defaultThemes, 'createThemes');

	const axes = buildAxisConfigs({
		scopeName: FLAT_SCOPE_NAME,
		scopeSegment: null,
		norm,
		defaultTheme: options.defaultTheme as string | undefined,
		defaultThemes,
		cookieTheme,
		label: 'createThemes'
	});

	const scopeConfig: ThemeScopeConfig = {
		name: FLAT_SCOPE_NAME,
		flat: norm.flat,
		axes,
		defaultScheme: (options.defaultScheme as Scheme | undefined) ?? 'system',
		cookieScheme,
		// One scope owns its scheme outright — no shared top-level scheme above it.
		independentScheme: true,
		syncTabs: options.syncTabs ?? true,
		syncChannel: options.syncChannel ?? 'svelte-themes'
	};

	clearRegistry();
	const scope = new ThemeScope(scopeConfig);
	registerScope(scope);
	scope.initClient();

	return {
		setTheme: (name: string, scheme?: Scheme) => scope.setTheme(name, scheme),
		getThemes: () => scope.getThemes(),
		getCurrentTheme: () => scope.getCurrentTheme(),
		getDefaultTheme: () => scope.getDefaultTheme(),
		getThemeSource: () => scope.getThemeSource(),
		isLoadingTheme: (name?: string) => scope.isLoadingTheme(name),
		getLoadingTheme: () => scope.getLoadingTheme()
	} as ThemesAPI<T>;
}

// Re-export for internal use by scoped.ts.
export type { ThemeLoader };
