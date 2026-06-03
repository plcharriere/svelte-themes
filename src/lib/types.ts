export type ThemeLoader = () => Promise<string | { default: string }>;

export type Scheme = 'light' | 'dark' | 'system';

export type Matcher = string | readonly string[] | ((url: URL) => boolean);

/** A `themes` value: flat (loaders) or axed (records of loaders), possibly mixed. */
export type Themes = Record<string, ThemeLoader | Record<string, ThemeLoader>>;

// ---------------------------------------------------------------------------
// Shape detection + axis partition (mirrors normalize.ts at the type level)
// ---------------------------------------------------------------------------

/** Is any value a record (= an axis) rather than a loader? */
export type HasAxis<T> = true extends {
	[K in keyof T]: T[K] extends ThemeLoader ? false : true;
}[keyof T]
	? true
	: false;

type BareLoaders<T> = { [K in keyof T as T[K] extends ThemeLoader ? K : never]: T[K] };
type NamedAxes<T> = { [K in keyof T as T[K] extends ThemeLoader ? never : K]: T[K] };
type ExplicitDefault<T> = 'default' extends keyof NamedAxes<T> ? NamedAxes<T>['default'] : object;
type DefaultAxis<T> = BareLoaders<T> & ExplicitDefault<T>;
type NamedNoDefault<T> = Omit<NamedAxes<T>, 'default'>;

/** Normalized axis map: named axes (sans `default`) + a merged `default` axis if any. */
export type Axes<T> = NamedNoDefault<T> &
	([keyof DefaultAxis<T>] extends [never] ? object : { default: DefaultAxis<T> });

// Per-shape projections.
type FlatName<T> = keyof T & string;
type AxedObject<T> = { [A in keyof Axes<T>]: keyof Axes<T>[A] & string };
type AxedNames<T> = { [A in keyof Axes<T>]: (keyof Axes<T>[A] & string)[] };
type AxedSource<T> = { [A in keyof Axes<T>]: 'cookie' | 'default' };
type AxedLoading<T> = Partial<{ [A in keyof Axes<T>]: keyof Axes<T>[A] & string }>;
type ThemeNameUnion<T> = AxedObject<T>[keyof Axes<T>];

/** The argument `setTheme` / `isLoadingTheme` accept for this themes shape. */
export type ThemeArg<T> = HasAxis<T> extends true ? ThemeNameUnion<T> : FlatName<T>;

// ---------------------------------------------------------------------------
// Config + handle types
// ---------------------------------------------------------------------------

export interface ThemesConfig<T extends Record<string, unknown> = Themes> {
	themes: T;
	defaultTheme?: HasAxis<T> extends true ? never : FlatName<T>;
	defaultThemes?: HasAxis<T> extends true ? Partial<AxedObject<T>> : never;
	defaultScheme?: Scheme;
	cookieTheme?: string;
	cookieScheme?: string;
	syncTabs?: boolean;
	syncChannel?: string;
}

/** The handle returned for one themes shape — string-shaped (flat) or object-shaped (axed). */
export interface ThemesAPI<T> {
	setTheme(name: ThemeArg<T>, scheme?: Scheme): Promise<void>;
	getThemes(): HasAxis<T> extends true ? AxedNames<T> : FlatName<T>[];
	getCurrentTheme(): HasAxis<T> extends true ? AxedObject<T> : FlatName<T>;
	getDefaultTheme(): HasAxis<T> extends true ? AxedObject<T> : FlatName<T>;
	getThemeSource(): HasAxis<T> extends true ? AxedSource<T> : 'cookie' | 'default';
	isLoadingTheme(name?: ThemeArg<T>): boolean;
	getLoadingTheme(): HasAxis<T> extends true ? AxedLoading<T> : FlatName<T> | null;
}

// ---------------------------------------------------------------------------
// Scoped config + handle types
// ---------------------------------------------------------------------------

export interface ScopeDecl<T extends Record<string, unknown> = Themes> {
	match: Matcher;
	themes: T;
	// Per-scope defaults are permissive (validated at runtime). Narrowing them
	// against each scope's own `themes` would require per-key generic inference
	// that breaks `S` inference for the whole config; the per-scope *handle*
	// narrowing (which only reads `themes`) is preserved. `createThemes` keeps
	// fully-typed defaults since its `themes` is a single direct type parameter.
	defaultTheme?: string;
	defaultThemes?: Record<string, string>;
	/** Used only when `sharedScheme: false`; ignored when shared. */
	defaultScheme?: Scheme;
}

export interface ScopedConfig<
	S extends Record<string, ScopeDecl> = Record<string, ScopeDecl>
> {
	scopes: S;
	defaultScheme?: Scheme;
	sharedScheme?: boolean;
	cookieTheme?: string;
	cookieScheme?: string;
	syncTabs?: boolean;
	syncChannel?: string;
}

export type ScopedAPI<S extends Record<string, ScopeDecl>> = {
	[K in keyof S & string]: ThemesAPI<S[K]['themes']>;
} & {
	getActiveScope(): keyof S & string;
};
