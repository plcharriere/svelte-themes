import { setConfig } from './config.js';
import {
	clearRegistry,
	registerScope,
	ThemeScope,
	type ThemeScopeConfig
} from './core.svelte.js';
import type { Scheme, ThemeLoader, ThemesAPI, ThemesConfig } from './types.js';

const COOKIE_NAME_RE = /^[A-Za-z0-9_-]+$/;

const FLAT_SCOPE_NAME = 'default';

/**
 * Register a single flat themes system. For per-section theming use
 * `createScopedThemes` from `@plcharriere/svelte-themes` instead — it has its
 * own entry point so the scoped machinery tree-shakes out of flat-only bundles.
 */
export function createThemes<T extends Record<string, ThemeLoader>>(
	options: ThemesConfig<T>
): ThemesAPI<T> {
	const names = Object.keys(options.themes);
	if (names.length === 0) {
		throw new Error('createThemes: no themes provided');
	}
	const defaultTheme = options.defaultTheme ?? (names[0] as keyof T & string);
	if (!Object.hasOwn(options.themes, defaultTheme)) {
		throw new Error(`createThemes: defaultTheme "${defaultTheme}" not found`);
	}
	const cookieTheme = options.cookieTheme ?? 'theme';
	const cookieScheme = options.cookieScheme ?? 'scheme';
	if (!COOKIE_NAME_RE.test(cookieTheme)) {
		throw new Error(
			`createThemes: cookieTheme "${cookieTheme}" must match ${COOKIE_NAME_RE}`
		);
	}
	if (!COOKIE_NAME_RE.test(cookieScheme)) {
		throw new Error(
			`createThemes: cookieScheme "${cookieScheme}" must match ${COOKIE_NAME_RE}`
		);
	}

	const defaultScheme: Scheme = options.defaultScheme ?? 'system';
	const syncTabs = options.syncTabs ?? true;
	const syncChannel = options.syncChannel ?? 'svelte-themes';

	// Tear down any prior scope (and its DOM/BC listeners) before swapping the
	// singleton config. Matches `createScopedThemes`'s order.
	clearRegistry();

	setConfig({
		themes: options.themes,
		defaultTheme,
		defaultScheme,
		cookieTheme,
		cookieScheme,
		syncTabs,
		syncChannel
	});

	const scopeConfig: ThemeScopeConfig = {
		name: FLAT_SCOPE_NAME,
		themes: options.themes,
		defaultTheme,
		defaultScheme,
		cookieTheme,
		cookieScheme,
		// Flat mode owns its scheme outright — there's only one scope and no
		// shared top-level scheme cookie above it.
		independentScheme: true,
		syncTabs,
		syncChannel
	};

	const scope = new ThemeScope(scopeConfig);
	registerScope(scope);
	scope.initClient();

	return {
		setTheme: (name, scheme) => scope.setTheme(name, scheme),
		getThemes: () => scope.getThemes() as (keyof T & string)[],
		getCurrentTheme: () => scope.getCurrentTheme() as keyof T & string,
		getDefaultTheme: () => scope.getDefaultTheme() as keyof T & string,
		isLoadingTheme: (name) => scope.isLoadingTheme(name),
		getLoadingTheme: () => scope.getLoadingTheme() as (keyof T & string) | null
	};
}
