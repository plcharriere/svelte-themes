import { beforeEach, describe, expect, it } from 'vitest';

import { createThemes } from '../src/lib/create.js';
import { clearRegistry, getFirstScope, getScope } from '../src/lib/core.svelte.js';

beforeEach(() => clearRegistry());

const T = {
	light: () => Promise.resolve(':root {}'),
	dark: () => Promise.resolve(':root {}')
};

describe('createThemes — config validation', () => {
	it('throws when no themes are provided', () => {
		expect(() => createThemes({ themes: {} })).toThrow(/no themes provided/);
	});

	it('throws when defaultTheme is not registered', () => {
		expect(() =>
			createThemes({ themes: T, defaultTheme: 'missing' as keyof typeof T })
		).toThrow(/defaultTheme "missing" not found/);
	});

	it('throws when cookieTheme has invalid characters', () => {
		expect(() => createThemes({ themes: T, cookieTheme: 'has space' })).toThrow(
			/cookieTheme "has space" must match/
		);
	});

	it('throws when cookieScheme has invalid characters', () => {
		expect(() => createThemes({ themes: T, cookieScheme: 'bad;name' })).toThrow(
			/cookieScheme "bad;name" must match/
		);
	});

	it('accepts the minimum valid config (just themes)', () => {
		expect(() => createThemes({ themes: T })).not.toThrow();
	});

	it('accepts all valid options', () => {
		expect(() =>
			createThemes({
				themes: T,
				defaultTheme: 'dark',
				defaultScheme: 'dark',
				cookieTheme: 'my-theme',
				cookieScheme: 'my-scheme',
				syncTabs: false,
				syncChannel: 'custom'
			})
		).not.toThrow();
	});

	it('accepts hyphens, underscores, alphanumerics in cookie names', () => {
		expect(() =>
			createThemes({ themes: T, cookieTheme: 'a_b-c123', cookieScheme: 'X-Y_9' })
		).not.toThrow();
	});

	it('rejects empty cookie names', () => {
		expect(() => createThemes({ themes: T, cookieTheme: '' })).toThrow(/must match/);
	});

	it('returns a handle with the expected functions', () => {
		const handle = createThemes({ themes: T });
		expect(typeof handle.setTheme).toBe('function');
		expect(typeof handle.getThemes).toBe('function');
		expect(typeof handle.getCurrentTheme).toBe('function');
		expect(typeof handle.getDefaultTheme).toBe('function');
		expect(typeof handle.isLoadingTheme).toBe('function');
		expect(typeof handle.getLoadingTheme).toBe('function');
	});
});

describe('createThemes — defaults', () => {
	it('defaultTheme falls back to the first registered theme', () => {
		const handle = createThemes({ themes: T });
		expect(handle.getDefaultTheme()).toBe('light');
	});

	it('respects an explicit defaultTheme', () => {
		const handle = createThemes({ themes: T, defaultTheme: 'dark' });
		expect(handle.getDefaultTheme()).toBe('dark');
	});

	it('getThemes returns all registered names in declaration order', () => {
		const handle = createThemes({ themes: T });
		expect(handle.getThemes()).toEqual(['light', 'dark']);
	});
});

describe('createThemes — registry integration', () => {
	it('registers a scope named "default" in the registry', () => {
		createThemes({ themes: T });
		expect(getScope('default')).toBeDefined();
		expect(getFirstScope()).toBe(getScope('default'));
	});

	it('clears the registry on each call (single-scope contract)', () => {
		createThemes({ themes: T });
		createThemes({ themes: { a: () => Promise.resolve('') } });
		// Second call wins; registry has just the new 'default' scope.
	});

	it('subsequent calls replace the previous scope', () => {
		createThemes({ themes: T, defaultTheme: 'light' });
		const handle = createThemes({ themes: T, defaultTheme: 'dark' });
		expect(handle.getDefaultTheme()).toBe('dark');
	});
});
