import { describe, expect, it } from 'vitest';

import { normalizeThemes } from '../src/lib/normalize.js';
import type { ThemeLoader } from '../src/lib/types.js';

const css = (s: string): ThemeLoader => () => Promise.resolve(s);

/** Pull just the ordered axis names + their theme-name lists for compact asserts. */
function shape(themes: Record<string, unknown>, label = 'test') {
	const norm = normalizeThemes(themes, label);
	return {
		flat: norm.flat,
		axes: norm.axes.map((a) => ({ name: a.name, themes: Object.keys(a.themes) }))
	};
}

// ---------------------------------------------------------------------------
// flat detection
// ---------------------------------------------------------------------------

describe('normalizeThemes — flat', () => {
	it('all loaders → a single anonymous `default` axis, flat=true', () => {
		expect(shape({ light: css(''), dark: css('') })).toEqual({
			flat: true,
			axes: [{ name: 'default', themes: ['light', 'dark'] }]
		});
	});

	it('a single loader is still flat', () => {
		expect(shape({ only: css('') })).toEqual({
			flat: true,
			axes: [{ name: 'default', themes: ['only'] }]
		});
	});

	it('flat axis points at the original themes object', () => {
		const themes = { a: css(''), b: css('') };
		const norm = normalizeThemes(themes, 'test');
		expect(norm.axes[0].themes).toBe(themes);
	});
});

// ---------------------------------------------------------------------------
// axed detection
// ---------------------------------------------------------------------------

describe('normalizeThemes — axed', () => {
	it('record values become named axes, flat=false', () => {
		expect(
			shape({
				colors: { salmon: css(''), sapphire: css('') },
				styles: { square: css(''), rounded: css('') }
			})
		).toEqual({
			flat: false,
			axes: [
				{ name: 'colors', themes: ['salmon', 'sapphire'] },
				{ name: 'styles', themes: ['square', 'rounded'] }
			]
		});
	});

	it('preserves declaration order of named axes', () => {
		const out = shape({
			zulu: { z1: css('') },
			alpha: { a1: css('') },
			mike: { m1: css('') }
		});
		expect(out.axes.map((a) => a.name)).toEqual(['zulu', 'alpha', 'mike']);
	});
});

// ---------------------------------------------------------------------------
// mixed: bare loaders fold into the `default` axis
// ---------------------------------------------------------------------------

describe('normalizeThemes — mixed (bare → default fold)', () => {
	it('bare loaders fold into a `default` axis placed first', () => {
		expect(
			shape({
				bubblegum: css(''),
				candyland: css(''),
				colors: { salmon: css(''), sapphire: css('') }
			})
		).toEqual({
			flat: false,
			axes: [
				{ name: 'default', themes: ['bubblegum', 'candyland'] },
				{ name: 'colors', themes: ['salmon', 'sapphire'] }
			]
		});
	});

	it('the default axis always comes before named axes regardless of source order', () => {
		const out = shape({
			colors: { salmon: css('') },
			bubblegum: css(''),
			styles: { square: css('') }
		});
		expect(out.axes.map((a) => a.name)).toEqual(['default', 'colors', 'styles']);
	});

	it('a single bare loader alongside an axis still folds into default', () => {
		expect(
			shape({
				solo: css(''),
				colors: { salmon: css('') }
			})
		).toEqual({
			flat: false,
			axes: [
				{ name: 'default', themes: ['solo'] },
				{ name: 'colors', themes: ['salmon'] }
			]
		});
	});
});

// ---------------------------------------------------------------------------
// explicit `default` axis merge (explicit wins on same-name)
// ---------------------------------------------------------------------------

describe('normalizeThemes — explicit `default` axis merge', () => {
	it('bare loaders merge with an explicit `default` axis', () => {
		expect(
			shape({
				bubblegum: css(''),
				default: { candyland: css('') },
				colors: { salmon: css('') }
			})
		).toEqual({
			flat: false,
			axes: [
				{ name: 'default', themes: ['bubblegum', 'candyland'] },
				{ name: 'colors', themes: ['salmon'] }
			]
		});
	});

	it('an explicit `default` axis with no bare loaders is still placed first', () => {
		const out = shape({
			colors: { salmon: css('') },
			default: { candyland: css('') }
		});
		expect(out.axes.map((a) => a.name)).toEqual(['default', 'colors']);
		expect(out.axes[0].themes).toEqual(['candyland']);
	});

	it('on a same-name collision the explicit `default` entry wins (object identity)', () => {
		const bare = css('bare');
		const explicit = css('explicit');
		const norm = normalizeThemes(
			{
				candyland: bare, // overridden
				default: { candyland: explicit }
			},
			'test'
		);
		expect(norm.flat).toBe(false);
		const def = norm.axes.find((a) => a.name === 'default')!;
		expect(Object.keys(def.themes)).toEqual(['candyland']);
		expect(def.themes.candyland).toBe(explicit);
	});

	it('bare keys not colliding sit alongside explicit default keys', () => {
		const out = shape({
			bare1: css(''),
			default: { exp1: css('') },
			bare2: css('')
		});
		expect(out.axes[0]).toEqual({ name: 'default', themes: ['bare1', 'bare2', 'exp1'] });
	});
});

// ---------------------------------------------------------------------------
// throws
// ---------------------------------------------------------------------------

describe('normalizeThemes — throws', () => {
	it('empty themes object throws with the label', () => {
		expect(() => normalizeThemes({}, 'createThemes')).toThrow(/createThemes: no themes provided/);
	});

	it('an axis with an empty record throws', () => {
		expect(() =>
			normalizeThemes({ colors: { salmon: css('') }, empty: {} }, 'scope "x"')
		).toThrow(/scope "x": axis "empty" has no themes/);
	});

	it('a non-loader value inside an axis record throws', () => {
		expect(() =>
			normalizeThemes(
				{ colors: { salmon: css(''), broken: 'not-a-loader' as unknown as ThemeLoader } },
				'createThemes'
			)
		).toThrow(/axis "colors" theme "broken" is not a loader function/);
	});
});
