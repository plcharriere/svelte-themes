export { createThemes } from './create.js';
export { createScopedThemes } from './scoped.js';
export {
	getThemes,
	getCurrentTheme,
	getDefaultTheme,
	getThemeSource,
	setTheme,
	isDark,
	getScheme,
	getDefaultScheme,
	getSchemeSource,
	setScheme,
	toggleScheme,
	isLoadingTheme,
	getLoadingTheme
} from './dispatchers.js';
export type {
	ThemesConfig,
	ThemesAPI,
	ThemeLoader,
	Scheme,
	Matcher,
	ScopeDecl,
	ScopedConfig,
	ScopedAPI
} from './types.js';
