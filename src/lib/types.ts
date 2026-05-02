export type ThemeLoader = () => Promise<string | { default: string }>;

export type Scheme = 'light' | 'dark' | 'system';

export interface ThemesConfig<T extends Record<string, ThemeLoader> = Record<string, ThemeLoader>> {
	themes: T;
	defaultTheme?: keyof T & string;
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

export interface ThemesAPI<T extends Record<string, ThemeLoader>> {
	setTheme(name: keyof T & string, scheme?: Scheme): Promise<void>;
	getThemes(): (keyof T & string)[];
	getCurrentTheme(): keyof T & string;
	getDefaultTheme(): keyof T & string;
	isLoadingTheme(name?: keyof T & string): boolean;
	getLoadingTheme(): (keyof T & string) | null;
}
