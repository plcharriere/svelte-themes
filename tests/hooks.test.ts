import { describe, expect, it } from 'vitest';

import { resolveScheme, resolveTheme } from '../src/lib/hooks.js';
import type { ThemeLoader } from '../src/lib/types.js';

const css = (s: string): ThemeLoader => () => Promise.resolve(s);

// ---------------------------------------------------------------------------
// resolveTheme
// ---------------------------------------------------------------------------

describe('resolveTheme', () => {
	const themes = { sunset: css(''), ocean: css('') };

	it('uses the cookie value when it names a registered theme', () => {
		expect(resolveTheme(themes, 'sunset', 'ocean')).toEqual({
			name: 'ocean',
			themeSource: 'cookie'
		});
	});

	it('falls back to defaultTheme when the cookie is undefined', () => {
		expect(resolveTheme(themes, 'sunset', undefined)).toEqual({
			name: 'sunset',
			themeSource: 'default'
		});
	});

	it('falls back to defaultTheme when the cookie names an unknown theme', () => {
		expect(resolveTheme(themes, 'sunset', 'mystery')).toEqual({
			name: 'sunset',
			themeSource: 'default'
		});
	});

	it("does not accept a theme outside the scope's subset", () => {
		// Imagine the scope is restricted to {slate, graphite}; a stale cookie
		// from the wider registry referencing 'sunset' must not leak through.
		const subset = { slate: css(''), graphite: css('') };
		expect(resolveTheme(subset, 'slate', 'sunset')).toEqual({
			name: 'slate',
			themeSource: 'default'
		});
	});

	it('treats prototype keys as unknown (uses Object.hasOwn)', () => {
		expect(resolveTheme(themes, 'sunset', 'toString')).toEqual({
			name: 'sunset',
			themeSource: 'default'
		});
	});
});

// ---------------------------------------------------------------------------
// resolveScheme
// ---------------------------------------------------------------------------

describe('resolveScheme', () => {
	it('cookie=dark → dark/cookie', () => {
		expect(resolveScheme('dark', null, 'system')).toEqual({
			dark: true,
			scheme: 'dark',
			schemeSource: 'cookie'
		});
	});

	it('cookie=light → light/cookie', () => {
		expect(resolveScheme('light', 'dark', 'system')).toEqual({
			dark: false,
			scheme: 'light',
			schemeSource: 'cookie'
		});
	});

	it('cookie=system + hint=dark → dark/system/cookie', () => {
		expect(resolveScheme('system', 'dark', 'light')).toEqual({
			dark: true,
			scheme: 'system',
			schemeSource: 'cookie'
		});
	});

	it('cookie=system + hint=light → not dark/system/cookie', () => {
		expect(resolveScheme('system', 'light', 'dark')).toEqual({
			dark: false,
			scheme: 'system',
			schemeSource: 'cookie'
		});
	});

	it('cookie=system + no hint → not dark/system/cookie', () => {
		expect(resolveScheme('system', null, 'dark')).toEqual({
			dark: false,
			scheme: 'system',
			schemeSource: 'cookie'
		});
	});

	it('no cookie + defaultScheme=system + hint=dark → dark/system/default', () => {
		expect(resolveScheme(undefined, 'dark', 'system')).toEqual({
			dark: true,
			scheme: 'system',
			schemeSource: 'default'
		});
	});

	it('no cookie + defaultScheme=system + no hint → not dark/system/default', () => {
		expect(resolveScheme(undefined, null, 'system')).toEqual({
			dark: false,
			scheme: 'system',
			schemeSource: 'default'
		});
	});

	it('no cookie + defaultScheme=dark → dark/dark/default', () => {
		expect(resolveScheme(undefined, null, 'dark')).toEqual({
			dark: true,
			scheme: 'dark',
			schemeSource: 'default'
		});
	});

	it('no cookie + defaultScheme=light → not dark/light/default', () => {
		expect(resolveScheme(undefined, 'dark', 'light')).toEqual({
			dark: false,
			scheme: 'light',
			schemeSource: 'default'
		});
	});

	it('garbage cookie value falls through to the default branch', () => {
		expect(resolveScheme('bogus', null, 'light')).toEqual({
			dark: false,
			scheme: 'light',
			schemeSource: 'default'
		});
	});
});
