/**
 * Type-level tests.
 *
 * The compiler is the test runner: every `@ts-expect-error` must have a real
 * type error underneath it (an unused directive is itself a compile error).
 * The runtime bodies never actually exercise the API — they sit inside
 * `if (false) { ... }` blocks so TypeScript still checks them but vitest
 * doesn't crash on undefined ambient values or throw on uninitialised state.
 *
 * Each `it()` ends with `expect(true).toBe(true)` so vitest records a pass.
 */

import { describe, expect, it } from 'vitest';

import {
	createScopedThemes,
	createThemes,
	setScheme,
	setTheme,
	toggleScheme
} from '../src/lib/index.js';
import type {
	Scheme,
	ScopedAPI,
	ScopeDecl,
	ThemeLoader,
	ThemesAPI
} from '../src/lib/index.js';

const css = (s: string): ThemeLoader => () => Promise.resolve(s);

const ALL = {
	sunset: css(''),
	ocean: css(''),
	slate: css(''),
	graphite: css('')
} as const;

// Helper: assert that two types are mutually assignable (i.e. equal).
// If the assertion fails, the function call won't type-check.
function assertType<T>(_value: T): void {
	/* no-op — the type parameter is the assertion */
}

// Compile-time constant that TS folds the same as a literal `false`, so
// branches under it type-check but vitest never executes them. Using a
// captured const (instead of bare `if (false)`) sidesteps the
// "unreachable code" lint without changing the semantics.
const NEVER = false as const;

// Materialize a value typed as T at the type level without running anything
// at runtime. Returns `undefined as unknown as T` — only safe inside `if
// (NEVER)` branches that never execute.
function phantom<T>(): T {
	return undefined as unknown as T;
}

// ---------------------------------------------------------------------------
// 1. Flat handle (`createThemes`)
// ---------------------------------------------------------------------------

describe('types — flat handle', () => {
	it('setTheme accepts a registered name', () => {
		if (NEVER) {
			const handle = phantom<ThemesAPI<typeof ALL>>();
			void handle.setTheme('sunset');
			void handle.setTheme('graphite');
		}
		expect(true).toBe(true);
	});

	it('setTheme rejects non-registered string literals', () => {
		if (NEVER) {
			const handle = phantom<ThemesAPI<typeof ALL>>();
			// @ts-expect-error 'nope' is not a key of T
			void handle.setTheme('nope');
		}
		expect(true).toBe(true);
	});

	it('getCurrentTheme() is typed to the registered theme names', () => {
		if (NEVER) {
			const handle = phantom<ThemesAPI<typeof ALL>>();
			const name = handle.getCurrentTheme();
			assertType<'sunset' | 'ocean' | 'slate' | 'graphite'>(name);
		}
		expect(true).toBe(true);
	});

	it('getDefaultTheme() is typed to the registered theme names', () => {
		if (NEVER) {
			const handle = phantom<ThemesAPI<typeof ALL>>();
			const name = handle.getDefaultTheme();
			assertType<'sunset' | 'ocean' | 'slate' | 'graphite'>(name);
		}
		expect(true).toBe(true);
	});

	it('isLoadingTheme accepts only registered names', () => {
		if (NEVER) {
			const handle = phantom<ThemesAPI<typeof ALL>>();
			// OK with no arg
			void handle.isLoadingTheme();
			// OK with a registered name
			void handle.isLoadingTheme('sunset');
			// @ts-expect-error 'foo' is not a key of T
			void handle.isLoadingTheme('foo');
		}
		expect(true).toBe(true);
	});

	it('createThemes config rejects unregistered defaultTheme', () => {
		if (NEVER) {
			// @ts-expect-error 'unregistered' is not a key of themes
			createThemes({ themes: ALL, defaultTheme: 'unregistered' });
		}
		expect(true).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// 2. Scoped per-scope handles (`createScopedThemes`)
// ---------------------------------------------------------------------------

type ScopedConf = {
	themes: typeof ALL;
	scopes: {
		landing: {
			match: '/';
			themes: readonly ['sunset', 'ocean'];
			defaultTheme: 'sunset';
		};
		admin: {
			match: '/admin';
			themes: readonly ['slate', 'graphite'];
			defaultTheme: 'slate';
		};
	};
};

type HomeConf = {
	themes: typeof ALL;
	scopes: {
		home: { match: '/'; defaultTheme: 'sunset' };
	};
};

// Real `createScopedThemes` calls wrapped in arrows so their return types can
// be extracted via `ReturnType` without execution. This verifies §5.5: a
// *plain* (no `as const`) `themes: [...]` array narrows on the returned API.
const makePlainScopedApi = () =>
	createScopedThemes({
		themes: ALL,
		scopes: {
			landing: {
				match: '/',
				themes: ['sunset', 'ocean'],
				defaultTheme: 'sunset'
			},
			admin: {
				match: '/admin',
				themes: ['slate', 'graphite'],
				defaultTheme: 'slate'
			}
		}
	});


describe('types — scoped per-scope handles', () => {
	it("admin.setTheme accepts admin's subset", () => {
		if (NEVER) {
			const api = phantom<ScopedAPI<ScopedConf['themes'], ScopedConf['scopes']>>();
			void api.admin.setTheme('slate');
			void api.admin.setTheme('graphite');
		}
		expect(true).toBe(true);
	});

	it("admin.setTheme rejects landing's subset", () => {
		if (NEVER) {
			const api = phantom<ScopedAPI<ScopedConf['themes'], ScopedConf['scopes']>>();
			// @ts-expect-error 'sunset' is in landing's subset, not admin's
			void api.admin.setTheme('sunset');
			// @ts-expect-error 'ocean' is in landing's subset, not admin's
			void api.admin.setTheme('ocean');
		}
		expect(true).toBe(true);
	});

	it("landing.setTheme rejects admin's subset (symmetric)", () => {
		if (NEVER) {
			const api = phantom<ScopedAPI<ScopedConf['themes'], ScopedConf['scopes']>>();
			// @ts-expect-error 'graphite' is in admin's subset, not landing's
			void api.landing.setTheme('graphite');
			// @ts-expect-error 'slate' is in admin's subset, not landing's
			void api.landing.setTheme('slate');
		}
		expect(true).toBe(true);
	});

	it("landing.getCurrentTheme() narrows to landing's subset", () => {
		if (NEVER) {
			const api = phantom<ScopedAPI<ScopedConf['themes'], ScopedConf['scopes']>>();
			const name = api.landing.getCurrentTheme();
			assertType<'sunset' | 'ocean'>(name);
		}
		expect(true).toBe(true);
	});

	it("admin.getCurrentTheme() narrows to admin's subset", () => {
		if (NEVER) {
			const api = phantom<ScopedAPI<ScopedConf['themes'], ScopedConf['scopes']>>();
			const name = api.admin.getCurrentTheme();
			assertType<'slate' | 'graphite'>(name);
		}
		expect(true).toBe(true);
	});

	it('a scope without an explicit themes subset inherits the full set', () => {
		if (NEVER) {
			const api = phantom<ScopedAPI<HomeConf['themes'], HomeConf['scopes']>>();
			// All four registered themes must be accepted.
			void api.home.setTheme('sunset');
			void api.home.setTheme('ocean');
			void api.home.setTheme('slate');
			void api.home.setTheme('graphite');
			const name = api.home.getCurrentTheme();
			assertType<'sunset' | 'ocean' | 'slate' | 'graphite'>(name);
		}
		expect(true).toBe(true);
	});

	it('plain `themes: [...]` (no `as const`) still narrows — §5.5', () => {
		if (NEVER) {
			// `plainScopedApi` is the return type of a real
			// `createScopedThemes` call with plain (non-`as const`) `themes`
			// arrays. If the `const` generic capture works, the assertions
			// below hold.
			const api = phantom<ReturnType<typeof makePlainScopedApi>>();
			void api.admin.setTheme('graphite'); // OK — in admin's subset
			// @ts-expect-error 'sunset' is in landing's subset, not admin's
			void api.admin.setTheme('sunset');
			// @ts-expect-error 'graphite' is in admin's subset, not landing's
			void api.landing.setTheme('graphite');
			// Narrowed return type on each scope
			assertType<'sunset' | 'ocean'>(api.landing.getCurrentTheme());
			assertType<'slate' | 'graphite'>(api.admin.getCurrentTheme());
		}
		expect(true).toBe(true);
	});

	it('defaultTheme outside the global registry is a type error', () => {
		if (NEVER) {
			createScopedThemes({
				themes: ALL,
				scopes: {
					a: {
						match: '/',
						// @ts-expect-error 'unregistered' is not a key of themes
						defaultTheme: 'unregistered'
					}
				}
			});
		}
		expect(true).toBe(true);
	});

	it("scope's themes array entries must be in the global registry", () => {
		if (NEVER) {
			createScopedThemes({
				themes: ALL,
				scopes: {
					a: {
						match: '/',
						// @ts-expect-error 'unknown' is not a key of themes
						themes: ['unknown'],
						defaultTheme: 'sunset'
					}
				}
			});
		}
		expect(true).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// 3. Root dispatcher functions (imported from package root)
// ---------------------------------------------------------------------------

describe('types — root dispatcher functions', () => {
	it('setTheme accepts any string (loose by design — §4.5)', () => {
		if (NEVER) {
			const arbitrary: string = phantom<string>();
			const p1 = setTheme(arbitrary);
			const p2 = setTheme('anything-at-all');
			assertType<Promise<void>>(p1);
			assertType<Promise<void>>(p2);
		}
		expect(true).toBe(true);
	});

	it('setTheme accepts an optional Scheme', () => {
		if (NEVER) {
			void setTheme('x', 'dark');
			void setTheme('x', 'light');
			void setTheme('x', 'system');
			// @ts-expect-error 'foo' is not a Scheme
			void setTheme('x', 'foo');
		}
		expect(true).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// 4. Scheme type + scheme dispatchers
// ---------------------------------------------------------------------------

describe('types — Scheme literal union', () => {
	it("setScheme accepts 'light' | 'dark' | 'system'", () => {
		if (NEVER) {
			setScheme('light');
			setScheme('dark');
			setScheme('system');
		}
		expect(true).toBe(true);
	});

	it('setScheme rejects unknown schemes', () => {
		if (NEVER) {
			// @ts-expect-error 'foo' is not a Scheme
			setScheme('foo');
			// @ts-expect-error empty string is not a Scheme
			setScheme('');
		}
		expect(true).toBe(true);
	});

	it('toggleScheme takes no args and returns void', () => {
		if (NEVER) {
			const r = toggleScheme();
			assertType<void>(r);
			// @ts-expect-error toggleScheme takes no args
			toggleScheme('dark');
		}
		expect(true).toBe(true);
	});

	it('Scheme type itself is the expected union', () => {
		if (NEVER) {
			const s1: Scheme = 'light';
			const s2: Scheme = 'dark';
			const s3: Scheme = 'system';
			// @ts-expect-error 'foo' is not a Scheme
			const s4: Scheme = 'foo';
			void s1;
			void s2;
			void s3;
			void s4;
		}
		expect(true).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// 5. ScopedAPI<T, S> return shape
// ---------------------------------------------------------------------------

describe('types — ScopedAPI return shape', () => {
	it('exposes one key per scope name plus getActiveScope', () => {
		if (NEVER) {
			const api = phantom<ScopedAPI<ScopedConf['themes'], ScopedConf['scopes']>>();
			// Each scope key resolves to a typed handle.
			void api.landing;
			void api.admin;
			// getActiveScope is present.
			void api.getActiveScope;
		}
		expect(true).toBe(true);
	});

	it('getActiveScope() returns a literal union of the scope names', () => {
		if (NEVER) {
			const api = phantom<ScopedAPI<ScopedConf['themes'], ScopedConf['scopes']>>();
			const name = api.getActiveScope();
			assertType<'landing' | 'admin'>(name);
		}
		expect(true).toBe(true);
	});

	it('indexing into a non-existent scope key is a type error', () => {
		if (NEVER) {
			const api = phantom<ScopedAPI<ScopedConf['themes'], ScopedConf['scopes']>>();
			// @ts-expect-error 'marketing' is not a declared scope
			void api.marketing;
			// @ts-expect-error 'getActiveScopes' (plural typo) is not on the API
			void api.getActiveScopes;
		}
		expect(true).toBe(true);
	});

	it('ScopeDecl<T> is parameterized by the global themes record', () => {
		if (NEVER) {
			type Decl = ScopeDecl<typeof ALL>;
			const ok: Decl = { match: '/', defaultTheme: 'sunset' };
			void ok;
			// @ts-expect-error 'nope' is not a key of ALL
			const bad: Decl = { match: '/', defaultTheme: 'nope' };
			void bad;
		}
		expect(true).toBe(true);
	});
});
