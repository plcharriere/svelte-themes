import { beforeEach, describe, expect, it } from 'vitest';

import { createThemes } from '../src/lib/create.js';
import { clearRegistry, getFirstScope, getScope } from '../src/lib/core.svelte.js';
import type { ThemeLoader } from '../src/lib/types.js';

const css = (s: string): ThemeLoader => () => Promise.resolve(s);

beforeEach(() => clearRegistry());

/** The single scope createThemes registers is named 'default'. */
function scopeConfig() {
	const scope = getScope('default');
	if (!scope) throw new Error('no default scope');
	return scope.config;
}

const FLAT = { light: css(':root {}'), dark: css(':root {}') };

// ---------------------------------------------------------------------------
// flat
// ---------------------------------------------------------------------------

describe('createThemes — flat', () => {
	it('returns a handle with the full function surface', () => {
		const h = createThemes({ themes: FLAT });
		for (const fn of [
			'setTheme',
			'getThemes',
			'getCurrentTheme',
			'getDefaultTheme',
			'getThemeSource',
			'isLoadingTheme',
			'getLoadingTheme'
		] as const) {
			expect(typeof h[fn]).toBe('function');
		}
	});

	it('registers a scope named "default" that is the first scope', () => {
		createThemes({ themes: FLAT });
		expect(getScope('default')).toBeDefined();
		expect(getFirstScope()).toBe(getScope('default'));
	});

	it('builds one flat axis with the bare `theme` cookie and `svelte-themes` style id', () => {
		createThemes({ themes: FLAT });
		const cfg = scopeConfig();
		expect(cfg.flat).toBe(true);
		expect(cfg.axes).toHaveLength(1);
		expect(cfg.axes[0]).toMatchObject({
			name: 'default',
			cookieName: 'theme',
			styleId: 'svelte-themes',
			defaultTheme: 'light',
			cacheKeyPrefix: 'default/default'
		});
	});

	it('flat scheme defaults: independentScheme=true, cookieScheme=scheme, default system', () => {
		createThemes({ themes: FLAT });
		const cfg = scopeConfig();
		expect(cfg.independentScheme).toBe(true);
		expect(cfg.cookieScheme).toBe('scheme');
		expect(cfg.defaultScheme).toBe('system');
	});

	it('getThemes / getDefaultTheme / getCurrentTheme are flat scalars in node', () => {
		const h = createThemes({ themes: FLAT });
		expect(h.getThemes()).toEqual(['light', 'dark']);
		expect(h.getDefaultTheme()).toBe('light');
		expect(h.getCurrentTheme()).toBe('light'); // no cookie/SSR state → default
		expect(h.getThemeSource()).toBe('default');
		expect(h.getLoadingTheme()).toBeNull();
		expect(h.isLoadingTheme()).toBe(false);
	});

	it('defaultTheme falls back to the first theme, or honors an explicit value', () => {
		expect(createThemes({ themes: FLAT }).getDefaultTheme()).toBe('light');
		clearRegistry();
		expect(createThemes({ themes: FLAT, defaultTheme: 'dark' }).getDefaultTheme()).toBe('dark');
	});

	it('subsequent calls replace the previous scope (single-scope contract)', () => {
		createThemes({ themes: FLAT, defaultTheme: 'light' });
		const h = createThemes({ themes: FLAT, defaultTheme: 'dark' });
		expect(h.getDefaultTheme()).toBe('dark');
		expect([...registrySize()]).toEqual(['default']);
	});
});

/** Names currently in the registry (createThemes should keep exactly one). */
function registrySize(): Set<string> {
	const out = new Set<string>();
	if (getScope('default')) out.add('default');
	return out;
}

// ---------------------------------------------------------------------------
// axed
// ---------------------------------------------------------------------------

const AXED = {
	colors: { salmon: css(''), sapphire: css('') },
	styles: { square: css(''), rounded: css('') }
};

describe('createThemes — axed', () => {
	it('derives `theme-${axis}` cookies and `svelte-themes-${axis}` style ids', () => {
		createThemes({ themes: AXED });
		const cfg = scopeConfig();
		expect(cfg.flat).toBe(false);
		expect(cfg.axes.map((a) => [a.name, a.cookieName, a.styleId])).toEqual([
			['colors', 'theme-colors', 'svelte-themes-colors'],
			['styles', 'theme-styles', 'svelte-themes-styles']
		]);
		expect(cfg.axes.map((a) => a.cacheKeyPrefix)).toEqual(['default/colors', 'default/styles']);
	});

	it('returns per-axis objects from the getters in node', () => {
		const h = createThemes({ themes: AXED });
		expect(h.getThemes()).toEqual({
			colors: ['salmon', 'sapphire'],
			styles: ['square', 'rounded']
		});
		expect(h.getCurrentTheme()).toEqual({ colors: 'salmon', styles: 'square' });
		expect(h.getDefaultTheme()).toEqual({ colors: 'salmon', styles: 'square' });
		expect(h.getThemeSource()).toEqual({ colors: 'default', styles: 'default' });
		expect(h.getLoadingTheme()).toEqual({}); // idle axed → empty object
		expect(h.isLoadingTheme()).toBe(false);
	});

	it('defaultThemes sets per-axis defaults', () => {
		const h = createThemes({ themes: AXED, defaultThemes: { colors: 'sapphire', styles: 'rounded' } });
		expect(h.getDefaultTheme()).toEqual({ colors: 'sapphire', styles: 'rounded' });
	});

	it('partial defaultThemes → omitted axis falls back to its first theme', () => {
		const h = createThemes({ themes: AXED, defaultThemes: { colors: 'sapphire' } });
		expect(h.getDefaultTheme()).toEqual({ colors: 'sapphire', styles: 'square' });
	});
});

// ---------------------------------------------------------------------------
// mixed
// ---------------------------------------------------------------------------

describe('createThemes — mixed', () => {
	it('folds bare loaders into a `default` axis, placed first', () => {
		createThemes({
			themes: {
				bubblegum: css(''),
				candyland: css(''),
				colors: { salmon: css(''), sapphire: css('') }
			}
		});
		const cfg = scopeConfig();
		expect(cfg.flat).toBe(false);
		expect(cfg.axes.map((a) => a.name)).toEqual(['default', 'colors']);
		expect(cfg.axes[0]).toMatchObject({
			cookieName: 'theme-default',
			styleId: 'svelte-themes-default'
		});
		expect(Object.keys(cfg.axes[0].themes)).toEqual(['bubblegum', 'candyland']);
	});

	it('merges bare loaders with an explicit `default` axis (explicit wins on collision)', () => {
		const h = createThemes({
			themes: {
				bubblegum: css(''),
				default: { candyland: css('') },
				colors: { salmon: css('') }
			}
		});
		expect(h.getThemes()).toEqual({
			default: ['bubblegum', 'candyland'],
			colors: ['salmon']
		});
	});
});

// ---------------------------------------------------------------------------
// cookie overrides
// ---------------------------------------------------------------------------

describe('createThemes — cookie overrides', () => {
	it('cookieTheme overrides the theme cookie token (flat)', () => {
		createThemes({ themes: FLAT, cookieTheme: 'th' });
		expect(scopeConfig().axes[0].cookieName).toBe('th');
	});

	it('cookieTheme overrides the per-axis cookie token (axed)', () => {
		createThemes({ themes: AXED, cookieTheme: 'th' });
		expect(scopeConfig().axes.map((a) => a.cookieName)).toEqual(['th-colors', 'th-styles']);
	});

	it('cookieScheme overrides the scheme cookie token', () => {
		createThemes({ themes: FLAT, cookieScheme: 'sc' });
		expect(scopeConfig().cookieScheme).toBe('sc');
	});
});

// ---------------------------------------------------------------------------
// validation throws
// ---------------------------------------------------------------------------

describe('createThemes — validation throws', () => {
	it('empty themes', () => {
		expect(() => createThemes({ themes: {} })).toThrow(/no themes provided/);
	});

	it('axis with empty record', () => {
		expect(() =>
			createThemes({ themes: { colors: { salmon: css('') }, empty: {} } })
		).toThrow(/axis "empty" has no themes/);
	});

	it('flat defaultTheme referencing a missing theme', () => {
		expect(() =>
			createThemes({ themes: FLAT, defaultTheme: 'missing' as keyof typeof FLAT })
		).toThrow(/defaultTheme "missing" not found in axis "default"/);
	});

	it('defaultThemes referencing an unknown axis', () => {
		expect(() =>
			createThemes({
				themes: AXED,
				defaultThemes: { nope: 'salmon' } as unknown as { colors: 'salmon' }
			})
		).toThrow(/defaultThemes references unknown axis "nope"/);
	});

	it('defaultThemes referencing a theme not in the axis', () => {
		expect(() =>
			createThemes({
				themes: AXED,
				defaultThemes: { colors: 'square' } as unknown as { colors: 'salmon' }
			})
		).toThrow(/defaultTheme "square" not found in axis "colors"/);
	});

	it('duplicate theme name across axes', () => {
		expect(() =>
			createThemes({
				themes: {
					colors: { dup: css(''), sapphire: css('') },
					styles: { dup: css(''), rounded: css('') }
				}
			})
		).toThrow(/duplicate theme name "dup" across axes/);
	});

	it('axis name not matching the cookie-name regex', () => {
		expect(() =>
			createThemes({ themes: { 'bad axis': { salmon: css('') } } })
		).toThrow(/axis name "bad axis" must match/);
	});

	it('invalid cookieTheme', () => {
		expect(() => createThemes({ themes: FLAT, cookieTheme: 'has space' })).toThrow(
			/cookieTheme "has space" must match/
		);
	});

	it('invalid cookieScheme', () => {
		expect(() => createThemes({ themes: FLAT, cookieScheme: 'bad;name' })).toThrow(
			/cookieScheme "bad;name" must match/
		);
	});

	it('empty cookie names are rejected', () => {
		expect(() => createThemes({ themes: FLAT, cookieTheme: '' })).toThrow(/must match/);
	});

	it('cookieTheme === cookieScheme must differ', () => {
		expect(() =>
			createThemes({ themes: FLAT, cookieTheme: 'same', cookieScheme: 'same' })
		).toThrow(/cookieTheme and cookieScheme must differ \("same"\)/);
	});
});
