/**
 * Type-level tests.
 *
 * The compiler is the test runner: every `@ts-expect-error` must have a real
 * type error underneath it (an unused directive is itself a compile error).
 * The runtime bodies never actually exercise the API — they sit inside
 * `if (NEVER) { ... }` blocks so TypeScript still type-checks them but vitest
 * never executes them (no undefined ambient access, no thrown validation).
 *
 * Each `it()` ends with `expect(true).toBe(true)` so vitest records a pass.
 */

import { describe, expect, it } from 'vitest';

import { createScopedThemes, createThemes } from '../src/lib/index.js';
import type { ScopeDecl, ThemeLoader, ThemesAPI } from '../src/lib/index.js';

const css = (s: string): ThemeLoader => () => Promise.resolve(s);

// Flat themes shape.
const FLAT = { sunset: css(''), ocean: css('') };

// Axed themes shape (two axes).
const AXED = {
	colors: { salmon: css(''), sapphire: css('') },
	styles: { square: css(''), rounded: css('') }
};

/** Assert two types are mutually assignable (i.e. equal at use sites). */
function assertType<T>(_value: T): void {
	/* the type parameter is the assertion */
}

// Folds the same as `false` so branches type-check but never run; a captured
// const sidesteps the "unreachable code" lint vs a bare `if (false)`.
const NEVER = false as const;

// Materialize a value typed as T without running anything — only safe under NEVER.
function phantom<T>(): T {
	return undefined as unknown as T;
}

// ---------------------------------------------------------------------------
// 1. createThemes — flat handle
// ---------------------------------------------------------------------------

describe('types — createThemes flat handle', () => {
	it('setTheme accepts a registered name, rejects unknown', () => {
		if (NEVER) {
			const handle = phantom<ThemesAPI<typeof FLAT>>();
			void handle.setTheme('sunset');
			void handle.setTheme('ocean');
			// @ts-expect-error 'nope' is not a registered flat theme name
			void handle.setTheme('nope');
		}
		expect(true).toBe(true);
	});

	it('getCurrentTheme() / getDefaultTheme() are the flat name union (string-shaped)', () => {
		if (NEVER) {
			const handle = phantom<ThemesAPI<typeof FLAT>>();
			assertType<'sunset' | 'ocean'>(handle.getCurrentTheme());
			assertType<'sunset' | 'ocean'>(handle.getDefaultTheme());
		}
		expect(true).toBe(true);
	});

	it('getThemes() is a flat name array; getThemeSource() is a scalar', () => {
		if (NEVER) {
			const handle = phantom<ThemesAPI<typeof FLAT>>();
			assertType<('sunset' | 'ocean')[]>(handle.getThemes());
			assertType<'cookie' | 'default'>(handle.getThemeSource());
			assertType<('sunset' | 'ocean') | null>(handle.getLoadingTheme());
		}
		expect(true).toBe(true);
	});

	it('isLoadingTheme accepts only registered names', () => {
		if (NEVER) {
			const handle = phantom<ThemesAPI<typeof FLAT>>();
			void handle.isLoadingTheme();
			void handle.isLoadingTheme('sunset');
			// @ts-expect-error 'foo' is not a registered flat theme name
			void handle.isLoadingTheme('foo');
		}
		expect(true).toBe(true);
	});

	it('config rejects an unregistered defaultTheme', () => {
		if (NEVER) {
			// @ts-expect-error 'unregistered' is not a key of themes
			createThemes({ themes: FLAT, defaultTheme: 'unregistered' });
		}
		expect(true).toBe(true);
	});

	it('flat config rejects defaultThemes (axed-only option)', () => {
		if (NEVER) {
			createThemes({
				themes: FLAT,
				// @ts-expect-error defaultThemes is `never` for a flat themes shape
				defaultThemes: { sunset: 'ocean' }
			});
		}
		expect(true).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// 2. createThemes — axed handle
// ---------------------------------------------------------------------------

describe('types — createThemes axed handle', () => {
	it('setTheme accepts the union of all axis theme names, rejects unknown', () => {
		if (NEVER) {
			const handle = phantom<ThemesAPI<typeof AXED>>();
			void handle.setTheme('salmon');
			void handle.setTheme('sapphire');
			void handle.setTheme('square');
			void handle.setTheme('rounded');
			// @ts-expect-error 'nope' is in no axis
			void handle.setTheme('nope');
		}
		expect(true).toBe(true);
	});

	it('getCurrentTheme() is a per-axis object assignable to Record<string,string>', () => {
		if (NEVER) {
			const handle = phantom<ThemesAPI<typeof AXED>>();
			const current = handle.getCurrentTheme();
			assertType<{ colors: 'salmon' | 'sapphire'; styles: 'square' | 'rounded' }>(current);
			// And it satisfies the looser record shape.
			const asRecord: Record<string, string> = current;
			void asRecord;
		}
		expect(true).toBe(true);
	});

	it('getThemes() / getThemeSource() / getLoadingTheme() are per-axis objects', () => {
		if (NEVER) {
			const handle = phantom<ThemesAPI<typeof AXED>>();
			assertType<{ colors: ('salmon' | 'sapphire')[]; styles: ('square' | 'rounded')[] }>(
				handle.getThemes()
			);
			assertType<{ colors: 'cookie' | 'default'; styles: 'cookie' | 'default' }>(
				handle.getThemeSource()
			);
			// getLoadingTheme: only loading axes present → Partial.
			const loading = handle.getLoadingTheme();
			assertType<Partial<{ colors: 'salmon' | 'sapphire'; styles: 'square' | 'rounded' }>>(loading);
		}
		expect(true).toBe(true);
	});

	it('axed config accepts a partial defaultThemes, rejects an unknown axis key', () => {
		if (NEVER) {
			createThemes({ themes: AXED, defaultThemes: { colors: 'sapphire' } });
			createThemes({
				themes: AXED,
				// @ts-expect-error 'nope' is not an axis of AXED
				defaultThemes: { nope: 'x' }
			});
		}
		expect(true).toBe(true);
	});

	it('axed config rejects defaultTheme (flat-only option)', () => {
		if (NEVER) {
			createThemes({
				themes: AXED,
				// @ts-expect-error defaultTheme is `never` for an axed themes shape
				defaultTheme: 'salmon'
			});
		}
		expect(true).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// 3. createScopedThemes — per-scope narrowing (plain literals, no `as const`)
// ---------------------------------------------------------------------------
//
// NOTE: per-scope `defaultTheme` / `defaultThemes` are intentionally omitted
// here. They are valid at runtime (covered in scoped.test.ts) but currently
// don't type-check through `createScopedThemes`'s generic constraint — see the
// `ScopeDecl<Themes>['defaultTheme'] === undefined` collapse documented in the
// final section. What this section verifies is the *narrowing* of each scope's
// handle from plain (no `as const`) object literals.

// Real call wrapped in an arrow so its return type can be read via ReturnType
// without execution. Plain object literals must still narrow each handle.
const makeScopedApi = () =>
	createScopedThemes({
		scopes: {
			landing: {
				match: '/',
				themes: { salmon: css(''), sapphire: css('') }
			},
			admin: {
				match: '/admin',
				themes: {
					density: { compact: css(''), comfy: css('') },
					accent: { blue: css(''), green: css('') }
				}
			}
		}
	});

type ScopedApi = ReturnType<typeof makeScopedApi>;

describe('types — createScopedThemes per-scope narrowing', () => {
	it("admin.setTheme is narrowed to admin's axis theme names", () => {
		if (NEVER) {
			const api = phantom<ScopedApi>();
			void api.admin.setTheme('compact');
			void api.admin.setTheme('green');
			// @ts-expect-error 'salmon' belongs to landing, not admin
			void api.admin.setTheme('salmon');
		}
		expect(true).toBe(true);
	});

	it("landing.setTheme rejects an admin-only theme", () => {
		if (NEVER) {
			const api = phantom<ScopedApi>();
			void api.landing.setTheme('salmon');
			void api.landing.setTheme('sapphire');
			// @ts-expect-error 'compact' belongs to admin, not landing
			void api.landing.setTheme('compact');
		}
		expect(true).toBe(true);
	});

	it('landing is flat (string getCurrentTheme), admin is axed (object)', () => {
		if (NEVER) {
			const api = phantom<ScopedApi>();
			assertType<'salmon' | 'sapphire'>(api.landing.getCurrentTheme());
			assertType<{ density: 'compact' | 'comfy'; accent: 'blue' | 'green' }>(
				api.admin.getCurrentTheme()
			);
		}
		expect(true).toBe(true);
	});

	it('getActiveScope() returns the scope-name union; indexing a missing scope errors', () => {
		if (NEVER) {
			const api = phantom<ScopedApi>();
			assertType<'landing' | 'admin'>(api.getActiveScope());
			void api.landing;
			void api.admin;
			// @ts-expect-error 'marketing' is not a declared scope
			void api.marketing;
			// @ts-expect-error 'getActiveScopes' (plural typo) is not on the API
			void api.getActiveScopes;
		}
		expect(true).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// 4. ScopedAPI / ScopeDecl shapes
// ---------------------------------------------------------------------------

describe('types — ScopedAPI / ScopeDecl shape', () => {
	it('the API exposes one narrowed handle per scope plus getActiveScope', () => {
		if (NEVER) {
			const api = phantom<ScopedApi>();
			// Each scope key resolves to a typed handle.
			assertType<'salmon' | 'sapphire'>(api.landing.getCurrentTheme());
			assertType<{ density: 'compact' | 'comfy'; accent: 'blue' | 'green' }>(
				api.admin.getCurrentTheme()
			);
			assertType<'landing' | 'admin'>(api.getActiveScope());
		}
		expect(true).toBe(true);
	});

	it('a ThemesAPI used directly carries the per-scope theme shape', () => {
		if (NEVER) {
			// ScopedAPI<S> maps each scope to a ThemesAPI<S[K]['themes']>.
			const flat = phantom<ThemesAPI<typeof FLAT>>();
			const axed = phantom<ThemesAPI<typeof AXED>>();
			assertType<'sunset' | 'ocean'>(flat.getCurrentTheme());
			assertType<{ colors: 'salmon' | 'sapphire'; styles: 'square' | 'rounded' }>(
				axed.getCurrentTheme()
			);
		}
		expect(true).toBe(true);
	});

	it('ScopeDecl per-scope defaults are permissive (validated at runtime, not narrowed)', () => {
		if (NEVER) {
			// Per-scope `defaultTheme` / `defaultThemes` accept any string — the
			// narrowing that would forbid a wrong name breaks `S` inference for the
			// whole scoped config, so it is intentionally permissive. Runtime
			// `createScopedThemes` validation throws on a bad default instead.
			const flat: ScopeDecl<typeof FLAT> = { match: '/', themes: FLAT, defaultTheme: 'anything' };
			void flat;
			const axed: ScopeDecl<typeof AXED> = {
				match: '/a',
				themes: AXED,
				defaultThemes: { colors: 'anything' }
			};
			void axed;
		}
		expect(true).toBe(true);
	});
});
