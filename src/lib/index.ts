export { createThemes } from './create.js';
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
} from './theme.svelte.js';
export type { ThemesConfig, ThemesAPI, ThemeLoader, Scheme } from './types.js';
