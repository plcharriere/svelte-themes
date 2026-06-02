import { beforeEach, describe, expect, it } from 'vitest';

import {
	clearRegistry,
	getScope,
	matchScope,
	registerScope,
	registerScopeMatcher,
	ThemeScope
} from '../src/lib/core.svelte.js';
import { createScopedThemes } from '../src/lib/scoped.js';
import type { Matcher, ThemeLoader } from '../src/lib/types.js';

const css = (s: string): ThemeLoader => () => Promise.resolve(s);

const ALL = {
	sunset: css(':root {}'),
	ocean: css(':root {}'),
	slate: css(':root {}'),
	graphite: css(':root {}')
} as const;

beforeEach(() => {
	clearRegistry();
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe('createScopedThemes — validation', () => {
	it('throws on empty scopes', () => {
		expect(() =>
			createScopedThemes({ themes: ALL, scopes: {} })
		).toThrow(/scopes must not be empty/);
	});

	it('throws on no themes', () => {
		expect(() =>
			createScopedThemes({
				themes: {},
				scopes: {
					a: { match: '/', defaultTheme: 'x' as never }
				}
			})
		).toThrow(/no themes provided/);
	});

	it('throws when a scope references an unknown theme', () => {
		expect(() =>
			createScopedThemes({
				themes: ALL,
				scopes: {
					admin: {
						match: '/admin',
						themes: ['unknown' as never],
						defaultTheme: 'unknown' as never
					}
				}
			})
		).toThrow(/references unknown theme "unknown"/);
	});

	it("throws when defaultTheme is outside the scope's subset", () => {
		expect(() =>
			createScopedThemes({
				themes: ALL,
				scopes: {
					admin: {
						match: '/admin',
						themes: ['slate', 'graphite'],
						// 'sunset' exists globally but not in the subset.
						defaultTheme: 'sunset'
					}
				}
			})
		).toThrow(/defaultTheme "sunset" not in its themes/);
	});

	it("throws when defaultTheme isn't in the global registry (subset omitted)", () => {
		expect(() =>
			createScopedThemes({
				themes: ALL,
				scopes: {
					a: {
						match: '/',
						defaultTheme: 'missing' as never
					}
				}
			})
		).toThrow(/defaultTheme "missing" not in its themes/);
	});

	it('throws on duplicate match patterns', () => {
		expect(() =>
			createScopedThemes({
				themes: ALL,
				scopes: {
					a: { match: '/admin', defaultTheme: 'sunset' },
					b: { match: '/admin', defaultTheme: 'ocean' }
				}
			})
		).toThrow(/identical match patterns/);
	});

	it('does not throw on duplicate predicate matchers (cannot compare structurally)', () => {
		const pred: Matcher = (u) => u.pathname === '/x';
		expect(() =>
			createScopedThemes({
				themes: ALL,
				scopes: {
					a: { match: pred, defaultTheme: 'sunset' },
					b: { match: pred, defaultTheme: 'ocean' }
				}
			})
		).not.toThrow();
	});

	it('throws when a scope is named getActiveScope', () => {
		expect(() =>
			createScopedThemes({
				themes: ALL,
				scopes: {
					getActiveScope: { match: '/', defaultTheme: 'sunset' }
				}
			})
		).toThrow(/reserved/);
	});

	it('throws on bad cookieTheme chars', () => {
		expect(() =>
			createScopedThemes({
				themes: ALL,
				scopes: {
					a: { match: '/', defaultTheme: 'sunset', cookieTheme: 'has space' }
				}
			})
		).toThrow(/cookieTheme "has space" must match/);
	});

	it('throws on bad cookieScheme chars', () => {
		expect(() =>
			createScopedThemes({
				themes: ALL,
				scopes: {
					a: {
						match: '/',
						defaultTheme: 'sunset',
						defaultScheme: 'dark',
						cookieScheme: 'bad;name'
					}
				}
			})
		).toThrow(/cookieScheme "bad;name" must match/);
	});

	it('throws on bad top-level cookieScheme chars', () => {
		expect(() =>
			createScopedThemes({
				themes: ALL,
				cookieScheme: 'bad;name',
				scopes: { a: { match: '/', defaultTheme: 'sunset' } }
			})
		).toThrow(/cookieScheme "bad;name" must match/);
	});

	it('throws when explicit cookieTheme values collide', () => {
		expect(() =>
			createScopedThemes({
				themes: ALL,
				scopes: {
					a: { match: '/a', defaultTheme: 'sunset', cookieTheme: 'shared' },
					b: { match: '/b', defaultTheme: 'ocean', cookieTheme: 'shared' }
				}
			})
		).toThrow(/share cookieTheme "shared"/);
	});

	it('throws when explicit independent cookieScheme values collide', () => {
		expect(() =>
			createScopedThemes({
				themes: ALL,
				scopes: {
					a: {
						match: '/a',
						defaultTheme: 'sunset',
						defaultScheme: 'dark',
						cookieScheme: 'shared'
					},
					b: {
						match: '/b',
						defaultTheme: 'ocean',
						defaultScheme: 'light',
						cookieScheme: 'shared'
					}
				}
			})
		).toThrow(/share cookieScheme "shared"/);
	});
});

// ---------------------------------------------------------------------------
// Cookie-name derivation
// ---------------------------------------------------------------------------

describe('createScopedThemes — cookie-name derivation', () => {
	it('derives cookieTheme as `${scopeName}-theme` when omitted', () => {
		createScopedThemes({
			themes: ALL,
			scopes: {
				landing: { match: '/', defaultTheme: 'sunset' },
				admin: { match: '/admin', defaultTheme: 'slate' }
			}
		});
		expect(getScope('landing')?.config.cookieTheme).toBe('landing-theme');
		expect(getScope('admin')?.config.cookieTheme).toBe('admin-theme');
	});

	it('shares top-level cookieScheme when a scope has no independent scheme', () => {
		createScopedThemes({
			themes: ALL,
			cookieScheme: 'scheme',
			scopes: {
				landing: { match: '/', defaultTheme: 'sunset' },
				admin: { match: '/admin', defaultTheme: 'slate' }
			}
		});
		expect(getScope('landing')?.config.cookieScheme).toBe('scheme');
		expect(getScope('admin')?.config.cookieScheme).toBe('scheme');
	});

	it('derives `${scope}-${topLevelCookieScheme}` for independent-scheme scopes', () => {
		createScopedThemes({
			themes: ALL,
			cookieScheme: 'scheme',
			scopes: {
				landing: { match: '/', defaultTheme: 'sunset' },
				admin: {
					match: '/admin',
					defaultTheme: 'slate',
					defaultScheme: 'dark' // makes scheme independent
				}
			}
		});
		expect(getScope('landing')?.config.cookieScheme).toBe('scheme');
		expect(getScope('admin')?.config.cookieScheme).toBe('admin-scheme');
	});

	it('uses a custom top-level cookieScheme base for derivation', () => {
		createScopedThemes({
			themes: ALL,
			cookieScheme: 'mode',
			scopes: {
				landing: { match: '/', defaultTheme: 'sunset' },
				admin: {
					match: '/admin',
					defaultTheme: 'slate',
					defaultScheme: 'dark'
				}
			}
		});
		expect(getScope('admin')?.config.cookieScheme).toBe('admin-mode');
	});

	it('respects an explicit cookieTheme override', () => {
		createScopedThemes({
			themes: ALL,
			scopes: {
				landing: {
					match: '/',
					defaultTheme: 'sunset',
					cookieTheme: 'custom-cookie'
				}
			}
		});
		expect(getScope('landing')?.config.cookieTheme).toBe('custom-cookie');
	});
});

// ---------------------------------------------------------------------------
// sharedScheme
// ---------------------------------------------------------------------------

describe('createScopedThemes — sharedScheme', () => {
	it('shares the scheme cookie across scopes by default', () => {
		createScopedThemes({
			themes: ALL,
			cookieScheme: 'scheme',
			scopes: {
				landing: { match: '/', defaultTheme: 'sunset' },
				admin: { match: '/admin', defaultTheme: 'slate' }
			}
		});
		expect(getScope('landing')?.config.cookieScheme).toBe('scheme');
		expect(getScope('admin')?.config.cookieScheme).toBe('scheme');
		expect(getScope('landing')?.config.independentScheme).toBe(false);
		expect(getScope('admin')?.config.independentScheme).toBe(false);
	});

	it('sharedScheme:false makes every scope independent with derived cookies', () => {
		createScopedThemes({
			themes: ALL,
			cookieScheme: 'scheme',
			sharedScheme: false,
			scopes: {
				landing: { match: '/', defaultTheme: 'sunset' },
				admin: { match: '/admin', defaultTheme: 'slate' }
			}
		});
		expect(getScope('landing')?.config.cookieScheme).toBe('landing-scheme');
		expect(getScope('admin')?.config.cookieScheme).toBe('admin-scheme');
		expect(getScope('landing')?.config.independentScheme).toBe(true);
		expect(getScope('admin')?.config.independentScheme).toBe(true);
	});

	it('sharedScheme:false still honors an explicit per-scope cookieScheme', () => {
		createScopedThemes({
			themes: ALL,
			sharedScheme: false,
			scopes: {
				landing: { match: '/', defaultTheme: 'sunset', cookieScheme: 'site-mode' },
				admin: { match: '/admin', defaultTheme: 'slate' }
			}
		});
		expect(getScope('landing')?.config.cookieScheme).toBe('site-mode');
		expect(getScope('admin')?.config.cookieScheme).toBe('admin-scheme');
	});

	it('sharedScheme:false scopes inherit the top-level defaultScheme', () => {
		createScopedThemes({
			themes: ALL,
			defaultScheme: 'dark',
			sharedScheme: false,
			scopes: {
				landing: { match: '/', defaultTheme: 'sunset' },
				admin: { match: '/admin', defaultTheme: 'slate' }
			}
		});
		expect(getScope('landing')?.config.defaultScheme).toBe('dark');
		expect(getScope('admin')?.config.defaultScheme).toBe('dark');
	});

	it('sharedScheme:true (explicit) matches the default', () => {
		createScopedThemes({
			themes: ALL,
			cookieScheme: 'scheme',
			sharedScheme: true,
			scopes: {
				landing: { match: '/', defaultTheme: 'sunset' },
				admin: { match: '/admin', defaultTheme: 'slate' }
			}
		});
		expect(getScope('landing')?.config.cookieScheme).toBe('scheme');
		expect(getScope('admin')?.config.cookieScheme).toBe('scheme');
	});
});

// ---------------------------------------------------------------------------
// Match resolution (pure logic via matchScope)
// ---------------------------------------------------------------------------

describe('matchScope — string prefix (segment-aware)', () => {
	function setup(name: string, matcher: Matcher): void {
		const scope = new ThemeScope({
			name,
			themes: ALL,
			defaultTheme: 'sunset',
			defaultScheme: 'system',
			cookieTheme: `${name}-theme`,
			cookieScheme: 'scheme',
			independentScheme: false,
			syncTabs: false,
			syncChannel: 'svelte-themes'
		});
		registerScope(scope);
		registerScopeMatcher(name, matcher);
	}

	it('matches /admin and /admin/<anything>', () => {
		setup('admin', '/admin');
		expect(matchScope('/admin')?.config.name).toBe('admin');
		expect(matchScope('/admin/users')?.config.name).toBe('admin');
		expect(matchScope('/admin/users/42')?.config.name).toBe('admin');
	});

	it('does NOT match /administrator', () => {
		setup('admin', '/admin');
		expect(matchScope('/administrator')).toBeUndefined();
	});

	it('does NOT match /', () => {
		setup('admin', '/admin');
		expect(matchScope('/')).toBeUndefined();
		expect(matchScope('/landing')).toBeUndefined();
	});

	it('root pattern "/" matches every path with prefix length 0', () => {
		setup('home', '/');
		expect(matchScope('/')?.config.name).toBe('home');
		expect(matchScope('/anything')?.config.name).toBe('home');
		expect(matchScope('/admin/users')?.config.name).toBe('home');
	});
});

describe('matchScope — array form (any-of)', () => {
	it('matches any element', () => {
		const scope = new ThemeScope({
			name: 'multi',
			themes: ALL,
			defaultTheme: 'sunset',
			defaultScheme: 'system',
			cookieTheme: 'multi-theme',
			cookieScheme: 'scheme',
			independentScheme: false,
			syncTabs: false,
			syncChannel: 'svelte-themes'
		});
		registerScope(scope);
		registerScopeMatcher('multi', ['/admin', '/dashboard']);
		expect(matchScope('/admin')?.config.name).toBe('multi');
		expect(matchScope('/dashboard/x')?.config.name).toBe('multi');
		expect(matchScope('/marketing')).toBeUndefined();
	});
});

describe('matchScope — longest prefix wins', () => {
	function makeScope(name: string, matcher: Matcher): void {
		const scope = new ThemeScope({
			name,
			themes: ALL,
			defaultTheme: 'sunset',
			defaultScheme: 'system',
			cookieTheme: `${name}-theme`,
			cookieScheme: 'scheme',
			independentScheme: false,
			syncTabs: false,
			syncChannel: 'svelte-themes'
		});
		registerScope(scope);
		registerScopeMatcher(name, matcher);
	}

	it('picks the most specific prefix', () => {
		makeScope('a', '/');
		makeScope('b', '/admin');
		makeScope('c', '/admin/users');
		expect(matchScope('/admin/users/42')?.config.name).toBe('c');
		expect(matchScope('/admin/settings')?.config.name).toBe('b');
		expect(matchScope('/landing')?.config.name).toBe('a');
	});
});

describe('matchScope — predicate form', () => {
	function setup(name: string, matcher: Matcher): void {
		const scope = new ThemeScope({
			name,
			themes: ALL,
			defaultTheme: 'sunset',
			defaultScheme: 'system',
			cookieTheme: `${name}-theme`,
			cookieScheme: 'scheme',
			independentScheme: false,
			syncTabs: false,
			syncChannel: 'svelte-themes'
		});
		registerScope(scope);
		registerScopeMatcher(name, matcher);
	}

	it('evaluates predicates in declaration order when no prefix matches', () => {
		setup('first', (u) => u.pathname.startsWith('/x'));
		setup('second', (u) => u.pathname.startsWith('/x'));
		expect(matchScope('/x/y')?.config.name).toBe('first');
	});

	it('skips predicates when a string prefix matches', () => {
		setup('byPath', '/admin');
		setup('byPred', () => true);
		expect(matchScope('/admin/users')?.config.name).toBe('byPath');
		expect(matchScope('/somewhere-else')?.config.name).toBe('byPred');
	});
});

describe('matchScope — no match falls through', () => {
	it('returns undefined when nothing matches', () => {
		const scope = new ThemeScope({
			name: 'admin',
			themes: ALL,
			defaultTheme: 'sunset',
			defaultScheme: 'system',
			cookieTheme: 'admin-theme',
			cookieScheme: 'scheme',
			independentScheme: false,
			syncTabs: false,
			syncChannel: 'svelte-themes'
		});
		registerScope(scope);
		registerScopeMatcher('admin', '/admin');
		expect(matchScope('/landing')).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// Handle shape + getActiveScope
// ---------------------------------------------------------------------------

describe('createScopedThemes — handle shape', () => {
	it('returns a flat-shaped handle per scope', () => {
		const api = createScopedThemes({
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

		for (const k of ['landing', 'admin'] as const) {
			const h = api[k];
			expect(typeof h.setTheme).toBe('function');
			expect(typeof h.getThemes).toBe('function');
			expect(typeof h.getCurrentTheme).toBe('function');
			expect(typeof h.getDefaultTheme).toBe('function');
			expect(typeof h.isLoadingTheme).toBe('function');
			expect(typeof h.getLoadingTheme).toBe('function');
		}

		expect(typeof api.getActiveScope).toBe('function');
	});

	it('exposes the scope subset on getThemes()', () => {
		const api = createScopedThemes({
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
		expect(api.landing.getThemes()).toEqual(['sunset', 'ocean']);
		expect(api.admin.getThemes()).toEqual(['slate', 'graphite']);
	});

	it('inherits the full registry when a scope omits themes', () => {
		const api = createScopedThemes({
			themes: ALL,
			scopes: {
				landing: { match: '/', defaultTheme: 'sunset' }
			}
		});
		expect(api.landing.getThemes()).toEqual(['sunset', 'ocean', 'slate', 'graphite']);
	});

	it('getActiveScope() returns the first scope name when no window/route matches', () => {
		const api = createScopedThemes({
			themes: ALL,
			scopes: {
				landing: { match: '/', defaultTheme: 'sunset' },
				admin: { match: '/admin', defaultTheme: 'slate' }
			}
		});
		expect(api.getActiveScope()).toBe('landing');
	});

	it('each scope reports its own defaultTheme', () => {
		const api = createScopedThemes({
			themes: ALL,
			scopes: {
				landing: { match: '/', defaultTheme: 'sunset' },
				admin: { match: '/admin', defaultTheme: 'slate' }
			}
		});
		expect(api.landing.getDefaultTheme()).toBe('sunset');
		expect(api.admin.getDefaultTheme()).toBe('slate');
	});
});
