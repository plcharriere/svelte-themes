export type ThemeLoader = () => Promise<string | { default: string }>;

export type Scheme = 'light' | 'dark' | 'system';

export interface ThemesConfig {
	themes: Record<string, ThemeLoader>;
	defaultTheme?: string;
	defaultScheme?: Scheme;
	cookieTheme?: string;
	cookieScheme?: string;
	syncTabs?: boolean;
	syncChannel?: string;
}

export interface ResolvedThemesConfig {
	themes: Record<string, ThemeLoader>;
	defaultTheme: string;
	defaultScheme: Scheme;
	cookieTheme: string;
	cookieScheme: string;
	syncTabs: boolean;
	syncChannel: string;
}
