import { beforeEach, describe, expect, it } from 'vitest';

import {
	clearRegistry,
	getScope,
	matchScope,
	registerScope,
	registerScopeMatcher,
	ThemeScope,
	type ThemeScopeConfig
} from '../src/lib/core.svelte.js';
import { createScopedThemes } from '../src/lib/scoped.js';
import type { Matcher, ThemeLoader } from '../src/lib/types.js';

const css = (s: string): ThemeLoader => () => Promise.resolve(s);

// Runtime escape hatch: per-scope `defaultTheme` / `defaultThemes` are valid at
// runtime but currently don't type-check through `createScopedThemes`'s generic
// constraint (the decl widens to `ScopeDecl<Themes>`, collapsing those fields to
// `never` / `undefined`). These tests exercise the *runtime* behavior, so they
// route the config through a loosely-typed call. Type-level coverage of the
// (working) per-scope narrowing lives in types.test.ts.
type ScopedArg = Parameters<typeof createScopedThemes>[0];
function scopedLoose(config: unknown): ReturnType<typeof createScopedThemes> {
	return createScopedThemes(config as ScopedArg);
}

beforeEach(() => clearRegistry());

function cfg(name: string): ThemeScopeConfig {
	const scope = getScope(name);
	if (!scope) throw new Error(`no scope "${name}"`);
	return scope.config;
}

// ---------------------------------------------------------------------------
// per-scope normalization + cookie derivation
// ---------------------------------------------------------------------------

describe('createScopedThemes — per-scope normalize + cookie derivation', () => {
	it('flat scope derives `theme-${scope}` (no axis suffix)', () => {
		createScopedThemes({
			scopes: {
				landing: { match: '/', themes: { salmon: css(''), sapphire: css('') } }
			}
		});
		const c = cfg('landing');
		expect(c.flat).toBe(true);
		expect(c.axes).toHaveLength(1);
		expect(c.axes[0]).toMatchObject({
			name: 'default',
			cookieName: 'theme-landing',
			styleId: 'svelte-themes',
			cacheKeyPrefix: 'landing/default'
		});
	});

	it('axed scope derives `theme-${scope}-${axis}` per axis', () => {
		createScopedThemes({
			scopes: {
				admin: {
					match: '/admin',
					themes: {
						density: { compact: css(''), comfy: css('') },
						accent: { blue: css(''), green: css('') }
					}
				}
			}
		});
		const c = cfg('admin');
		expect(c.flat).toBe(false);
		expect(c.axes.map((a) => [a.name, a.cookieName, a.styleId])).toEqual([
			['density', 'theme-admin-density', 'svelte-themes-density'],
			['accent', 'theme-admin-accent', 'svelte-themes-accent']
		]);
	});

	it('mixed scope: bare loaders fold into `theme-${scope}-default`', () => {
		createScopedThemes({
			scopes: {
				shop: {
					match: '/shop',
					themes: { bubblegum: css(''), colors: { salmon: css('') } }
				}
			}
		});
		const c = cfg('shop');
		expect(c.axes.map((a) => a.cookieName)).toEqual(['theme-shop-default', 'theme-shop-colors']);
	});

	it('theme names are scope-local — same name in two scopes is fine', () => {
		expect(() =>
			createScopedThemes({
				scopes: {
					landing: { match: '/', themes: { salmon: css(''), sapphire: css('') } },
					admin: { match: '/admin', themes: { salmon: css(''), green: css('') } }
				}
			})
		).not.toThrow();
		expect(cfg('landing').axes[0].cacheKeyPrefix).toBe('landing/default');
		expect(cfg('admin').axes[0].cacheKeyPrefix).toBe('admin/default');
	});

	it('cookieTheme prefix applies to all derived theme cookies', () => {
		createScopedThemes({
			cookieTheme: 'th',
			scopes: {
				landing: { match: '/', themes: { salmon: css('') } },
				admin: { match: '/admin', themes: { density: { compact: css('') } } }
			}
		});
		expect(cfg('landing').axes[0].cookieName).toBe('th-landing');
		expect(cfg('admin').axes[0].cookieName).toBe('th-admin-density');
	});
});

// ---------------------------------------------------------------------------
// per-scope defaults
// ---------------------------------------------------------------------------

describe('createScopedThemes — per-scope defaults', () => {
	it('flat scope uses defaultTheme; falls back to first theme', () => {
		const api = scopedLoose({
			scopes: {
				landing: { match: '/', themes: { salmon: css(''), sapphire: css('') }, defaultTheme: 'sapphire' },
				other: { match: '/other', themes: { a: css(''), b: css('') } }
			}
		});
		expect(api.landing.getDefaultTheme()).toBe('sapphire');
		expect(api.other.getDefaultTheme()).toBe('a');
	});

	it('axed scope uses defaultThemes (partial → first theme for omitted axes)', () => {
		const api = scopedLoose({
			scopes: {
				admin: {
					match: '/admin',
					themes: {
						density: { compact: css(''), comfy: css('') },
						accent: { blue: css(''), green: css('') }
					},
					defaultThemes: { accent: 'green' }
				}
			}
		});
		expect(api.admin.getDefaultTheme()).toEqual({ density: 'compact', accent: 'green' });
	});
});

// ---------------------------------------------------------------------------
// scheme: sharedScheme master switch
// ---------------------------------------------------------------------------

describe('createScopedThemes — sharedScheme', () => {
	it('default (shared): independentScheme=false and the `scheme` cookie everywhere', () => {
		createScopedThemes({
			scopes: {
				landing: { match: '/', themes: { salmon: css('') } },
				admin: { match: '/admin', themes: { compact: css('') } }
			}
		});
		for (const name of ['landing', 'admin']) {
			expect(cfg(name).independentScheme).toBe(false);
			expect(cfg(name).cookieScheme).toBe('scheme');
		}
	});

	it('shared: per-scope defaultScheme is ignored, top-level defaultScheme wins', () => {
		createScopedThemes({
			defaultScheme: 'dark',
			scopes: {
				landing: { match: '/', themes: { salmon: css('') }, defaultScheme: 'light' },
				admin: { match: '/admin', themes: { compact: css('') } }
			}
		});
		expect(cfg('landing').defaultScheme).toBe('dark'); // per-scope 'light' ignored
		expect(cfg('admin').defaultScheme).toBe('dark');
	});

	it('independent (sharedScheme:false): per-scope `scheme-${scope}` cookie + independentScheme=true', () => {
		createScopedThemes({
			sharedScheme: false,
			scopes: {
				landing: { match: '/', themes: { salmon: css('') } },
				admin: { match: '/admin', themes: { compact: css('') } }
			}
		});
		expect(cfg('landing')).toMatchObject({ independentScheme: true, cookieScheme: 'scheme-landing' });
		expect(cfg('admin')).toMatchObject({ independentScheme: true, cookieScheme: 'scheme-admin' });
	});

	it('independent: per-scope defaultScheme applies, falling back to top-level', () => {
		createScopedThemes({
			sharedScheme: false,
			defaultScheme: 'dark',
			scopes: {
				landing: { match: '/', themes: { salmon: css('') }, defaultScheme: 'light' },
				admin: { match: '/admin', themes: { compact: css('') } } // no per-scope → top-level
			}
		});
		expect(cfg('landing').defaultScheme).toBe('light');
		expect(cfg('admin').defaultScheme).toBe('dark');
	});

	it('cookieScheme prefix applies to per-scope scheme cookies when independent', () => {
		createScopedThemes({
			sharedScheme: false,
			cookieScheme: 'sc',
			scopes: {
				landing: { match: '/', themes: { salmon: css('') } },
				admin: { match: '/admin', themes: { compact: css('') } }
			}
		});
		expect(cfg('landing').cookieScheme).toBe('sc-landing');
		expect(cfg('admin').cookieScheme).toBe('sc-admin');
	});
});

// ---------------------------------------------------------------------------
// validation throws
// ---------------------------------------------------------------------------

describe('createScopedThemes — validation throws', () => {
	it('empty scopes', () => {
		expect(() => createScopedThemes({ scopes: {} })).toThrow(/scopes must not be empty/);
	});

	it('scope named `getActiveScope` is reserved', () => {
		expect(() =>
			createScopedThemes({
				scopes: { getActiveScope: { match: '/', themes: { a: css('') } } }
			})
		).toThrow(/scope name "getActiveScope" is reserved/);
	});

	it('scope name not matching the cookie-name regex', () => {
		expect(() =>
			createScopedThemes({ scopes: { 'bad name': { match: '/', themes: { a: css('') } } } })
		).toThrow(/name must match/);
	});

	it('axis name not matching the cookie-name regex', () => {
		expect(() =>
			createScopedThemes({
				scopes: { admin: { match: '/admin', themes: { 'bad axis': { a: css('') } } } }
			})
		).toThrow(/axis name "bad axis" must match/);
	});

	it('two scopes with identical match patterns', () => {
		expect(() =>
			createScopedThemes({
				scopes: {
					a: { match: '/dash', themes: { x: css('') } },
					b: { match: '/dash', themes: { y: css('') } }
				}
			})
		).toThrow(/scopes "a" and "b" have identical match patterns/);
	});

	it('identical match patterns detected across array order', () => {
		expect(() =>
			createScopedThemes({
				scopes: {
					a: { match: ['/x', '/y'], themes: { x: css('') } },
					b: { match: ['/y', '/x'], themes: { y: css('') } }
				}
			})
		).toThrow(/have identical match patterns/);
	});

	it('two scopes deriving the same cookie (hyphen aliasing)', () => {
		// flat scope "admin-x" → theme-admin-x; axed scope "admin" axis "x" → theme-admin-x.
		expect(() =>
			createScopedThemes({
				scopes: {
					'admin-x': { match: '/ax', themes: { a: css('') } },
					admin: { match: '/admin', themes: { x: { b: css('') } } }
				}
			})
		).toThrow(/derive the same cookie "theme-admin-x"/);
	});

	it('flat defaultTheme referencing a missing theme', () => {
		expect(() =>
			scopedLoose({
				scopes: {
					landing: {
						match: '/',
						themes: { salmon: css('') },
						defaultTheme: 'nope'
					}
				}
			})
		).toThrow(/defaultTheme "nope" not found in axis "default"/);
	});

	it('defaultThemes referencing an unknown axis', () => {
		expect(() =>
			scopedLoose({
				scopes: {
					admin: {
						match: '/admin',
						themes: { density: { compact: css('') } },
						defaultThemes: { nope: 'x' }
					}
				}
			})
		).toThrow(/defaultThemes references unknown axis "nope"/);
	});

	it('duplicate theme name across a scope axes', () => {
		expect(() =>
			createScopedThemes({
				scopes: {
					admin: {
						match: '/admin',
						themes: {
							density: { dup: css('') },
							accent: { dup: css('') }
						}
					}
				}
			})
		).toThrow(/duplicate theme name "dup" across axes/);
	});

	it('cookieTheme === cookieScheme must differ', () => {
		expect(() =>
			createScopedThemes({
				cookieTheme: 'same',
				cookieScheme: 'same',
				scopes: { landing: { match: '/', themes: { salmon: css('') } } }
			})
		).toThrow(/cookieTheme and cookieScheme must differ/);
	});

	it('invalid cookieTheme / cookieScheme', () => {
		expect(() =>
			createScopedThemes({
				cookieTheme: 'has space',
				scopes: { landing: { match: '/', themes: { salmon: css('') } } }
			})
		).toThrow(/cookieTheme "has space" must match/);
		clearRegistry();
		expect(() =>
			createScopedThemes({
				cookieScheme: 'bad;name',
				scopes: { landing: { match: '/', themes: { salmon: css('') } } }
			})
		).toThrow(/cookieScheme "bad;name" must match/);
	});
});

// ---------------------------------------------------------------------------
// getActiveScope() in node
// ---------------------------------------------------------------------------

describe('createScopedThemes — getActiveScope (node)', () => {
	it('returns the first declared scope name when there is no window', () => {
		const api = createScopedThemes({
			scopes: {
				landing: { match: '/', themes: { salmon: css('') } },
				admin: { match: '/admin', themes: { compact: css('') } }
			}
		});
		expect(api.getActiveScope()).toBe('landing');
	});
});

// ---------------------------------------------------------------------------
// matchScope routing — tested via the registry directly (segment-aware longest
// prefix). Build bare ThemeScopes so we control matchers precisely.
// ---------------------------------------------------------------------------

function bareScope(name: string): ThemeScope {
	return new ThemeScope({
		name,
		flat: true,
		axes: [
			{
				name: 'default',
				themes: { only: css('') },
				defaultTheme: 'only',
				styleId: 'svelte-themes',
				cookieName: `theme-${name}`,
				cacheKeyPrefix: `${name}/default`
			}
		],
		defaultScheme: 'system',
		cookieScheme: 'scheme',
		independentScheme: false,
		syncTabs: false,
		syncChannel: 'svelte-themes'
	});
}

function register(name: string, matcher: Matcher): void {
	registerScope(bareScope(name));
	registerScopeMatcher(name, matcher);
}

describe('matchScope — routing', () => {
	it('string prefix matches exact + nested, but not a longer same-prefix word', () => {
		register('admin', '/admin');
		expect(matchScope('/admin')?.config.name).toBe('admin');
		expect(matchScope('/admin/users')?.config.name).toBe('admin');
		expect(matchScope('/administrator')).toBeUndefined(); // segment-aware: not a match
	});

	it('longest prefix wins across scopes', () => {
		register('admin', '/admin');
		register('adminUsers', '/admin/users');
		expect(matchScope('/admin/users/42')?.config.name).toBe('adminUsers');
		expect(matchScope('/admin/settings')?.config.name).toBe('admin');
	});

	it('`/` is a catch-all of length 0 (loses to any real prefix)', () => {
		register('root', '/');
		register('admin', '/admin');
		expect(matchScope('/admin')?.config.name).toBe('admin');
		expect(matchScope('/anything/else')?.config.name).toBe('root');
		expect(matchScope('/')?.config.name).toBe('root');
	});

	it('array matcher matches any of its patterns', () => {
		register('multi', ['/blog', '/news']);
		expect(matchScope('/blog/post')?.config.name).toBe('multi');
		expect(matchScope('/news')?.config.name).toBe('multi');
		expect(matchScope('/other')).toBeUndefined();
	});

	it('predicate matcher is a fallback (only when no string/array matches)', () => {
		register('pred', (url: URL) => url.pathname.startsWith('/p'));
		expect(matchScope('/products')?.config.name).toBe('pred');
		expect(matchScope('/other')).toBeUndefined();
	});

	it('string/array matches beat predicates even with predicates registered first', () => {
		register('pred', (url: URL) => url.pathname.startsWith('/admin'));
		register('admin', '/admin');
		expect(matchScope('/admin')?.config.name).toBe('admin');
	});

	it('predicates run in declaration order', () => {
		register('first', (url: URL) => url.pathname.startsWith('/x'));
		register('second', (url: URL) => url.pathname.startsWith('/x'));
		expect(matchScope('/x/y')?.config.name).toBe('first');
	});

	it('no match → undefined (caller falls back to the first scope)', () => {
		register('admin', '/admin');
		expect(matchScope('/nowhere')).toBeUndefined();
	});
});
