export type ThemeLoader = () => Promise<string | { default: string }>;

export interface ThemesConfig {
	themes: Record<string, ThemeLoader>;
	defaultTheme?: string;
	defaultDark?: boolean;
	cookieTheme?: string;
	cookieDark?: string;
	syncTabs?: boolean;
	syncChannel?: string;
}

export interface ResolvedThemesConfig {
	themes: Record<string, ThemeLoader>;
	defaultTheme: string;
	defaultDark: boolean;
	cookieTheme: string;
	cookieDark: string;
	syncTabs: boolean;
	syncChannel: string;
}
