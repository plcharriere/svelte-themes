export type ThemeLoader = () => Promise<string | { default: string }>;

export type Scheme = 'light' | 'dark' | 'system';

export type Matcher = string | readonly string[] | ((url: URL) => boolean);

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

export interface ScopeDecl<T extends Record<string, ThemeLoader>> {
	match: Matcher;
	themes?: readonly (keyof T & string)[];
	defaultTheme: keyof T & string;
	defaultScheme?: Scheme;
	cookieTheme?: string;
	cookieScheme?: string;
}

export interface ScopedConfig<
	T extends Record<string, ThemeLoader> = Record<string, ThemeLoader>,
	S extends Record<string, ScopeDecl<T>> = Record<string, ScopeDecl<T>>
> {
	themes: T;
	defaultScheme?: Scheme;
	cookieScheme?: string;
	/**
	 * Whether scopes share one scheme (light/dark) cookie. Default `true` —
	 * changing the scheme on one scope applies everywhere (dark mode is usually
	 * a global user preference). Set `false` to give every scope its own scheme
	 * cookie (auto-derived `${scopeName}-${cookieScheme}`) so each section
	 * remembers its own light/dark independently. A scope that declares its own
	 * `defaultScheme`/`cookieScheme` is always independent regardless.
	 */
	sharedScheme?: boolean;
	scopes: S;
	syncTabs?: boolean;
	syncChannel?: string;
}

type ScopeNarrowed<
	T extends Record<string, ThemeLoader>,
	D extends ScopeDecl<T>
> = D['themes'] extends readonly (keyof T & string)[]
	? Pick<T, D['themes'][number]>
	: T;

export type ScopedAPI<
	T extends Record<string, ThemeLoader>,
	S extends Record<string, ScopeDecl<T>>
> = {
	[K in keyof S & string]: ThemesAPI<ScopeNarrowed<T, S[K]>>;
} & {
	getActiveScope(): keyof S & string;
};
