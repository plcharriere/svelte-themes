import { beforeEach, describe, expect, it } from 'vitest';

import {
	applyActiveScopeOnNavigation,
	clearRegistry,
	getLastActiveScopeName,
	idlePreloadCandidates,
	registerScope,
	registerScopeMatcher,
	setLastActiveScopeName,
	shouldSwapOnNavigation,
	ThemeScope,
	type ThemeScopeConfig
} from '../src/lib/core.svelte.js';
import type { Matcher, ThemeLoader } from '../src/lib/types.js';

const css = (s: string): ThemeLoader => () => Promise.resolve(s);

const ALL = {
	sunset: css(':root {}'),
	ocean: css(':root {}'),
	slate: css(':root {}'),
	graphite: css(':root {}')
} as const;

function makeScope(
	name: string,
	overrides: Partial<ThemeScopeConfig> = {}
): ThemeScope {
	return new ThemeScope({
		name,
		themes: ALL,
		defaultTheme: 'sunset',
		defaultScheme: 'system',
		cookieTheme: `${name}-theme`,
		cookieScheme: 'scheme',
		independentScheme: false,
		syncTabs: false,
		syncChannel: 'svelte-themes',
		...overrides
	});
}

function register(name: string, matcher: Matcher, scope: ThemeScope): void {
	registerScope(scope);
	registerScopeMatcher(name, matcher);
}

beforeEach(() => {
	clearRegistry();
});

// ---------------------------------------------------------------------------
// shouldSwapOnNavigation — pure decision
// ---------------------------------------------------------------------------

describe('shouldSwapOnNavigation', () => {
	it('returns false when next scope is undefined', () => {
		expect(shouldSwapOnNavigation('landing', undefined)).toBe(false);
	});

	it('returns false when next scope is null', () => {
		expect(shouldSwapOnNavigation('landing', null)).toBe(false);
	});

	it('returns false when next equals prev', () => {
		expect(shouldSwapOnNavigation('admin', 'admin')).toBe(false);
	});

	it('returns true when next differs from prev', () => {
		expect(shouldSwapOnNavigation('landing', 'admin')).toBe(true);
	});

	it('returns true on the very first navigation (prev null)', () => {
		expect(shouldSwapOnNavigation(null, 'landing')).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// idlePreloadCandidates — pure enumeration
// ---------------------------------------------------------------------------

describe('idlePreloadCandidates', () => {
	it('skips the primary scope, yields the rest with their default theme', () => {
		const scopes = new Map<string, ThemeScope>();
		scopes.set(
			'landing',
			makeScope('landing', { defaultTheme: 'sunset' })
		);
		scopes.set('admin', makeScope('admin', { defaultTheme: 'slate' }));
		scopes.set(
			'marketing',
			makeScope('marketing', { defaultTheme: 'ocean' })
		);

		const out = idlePreloadCandidates(scopes, 'landing');
		expect(out).toEqual([
			{ scopeName: 'admin', themeName: 'slate' },
			{ scopeName: 'marketing', themeName: 'ocean' }
		]);
	});

	it('returns an empty array when only the primary scope exists', () => {
		const scopes = new Map<string, ThemeScope>();
		scopes.set('only', makeScope('only'));
		expect(idlePreloadCandidates(scopes, 'only')).toEqual([]);
	});

	it('uses each scope `defaultTheme` when document is unavailable (node env)', () => {
		// In the node test env there is no `document`, so
		// resolveTargetThemeFromCookie() falls back to defaultTheme — exactly
		// the "no cookie set yet" branch we want to test.
		const scopes = new Map<string, ThemeScope>();
		scopes.set(
			'home',
			makeScope('home', { defaultTheme: 'sunset' })
		);
		scopes.set(
			'admin',
			makeScope('admin', { defaultTheme: 'graphite' })
		);
		const out = idlePreloadCandidates(scopes, 'home');
		expect(out).toEqual([{ scopeName: 'admin', themeName: 'graphite' }]);
	});

	it('preserves declaration order from the registry Map', () => {
		const scopes = new Map<string, ThemeScope>();
		scopes.set('a', makeScope('a', { defaultTheme: 'sunset' }));
		scopes.set('b', makeScope('b', { defaultTheme: 'ocean' }));
		scopes.set('c', makeScope('c', { defaultTheme: 'slate' }));
		scopes.set('d', makeScope('d', { defaultTheme: 'graphite' }));

		expect(idlePreloadCandidates(scopes, 'b')).toEqual([
			{ scopeName: 'a', themeName: 'sunset' },
			{ scopeName: 'c', themeName: 'slate' },
			{ scopeName: 'd', themeName: 'graphite' }
		]);
	});
});

// ---------------------------------------------------------------------------
// applyActiveScopeOnNavigation — integration via lastActiveScopeName tracking
// ---------------------------------------------------------------------------
//
// In node there is no `document`, so the actual DOM apply inside
// `applyScopeStateFromCookies` is a no-op. We still verify that the
// last-active-scope bookkeeping moves correctly when the route changes.

describe('applyActiveScopeOnNavigation — scope tracking', () => {
	it('updates last-active when crossing scopes', async () => {
		register('landing', '/', makeScope('landing'));
		register('admin', '/admin', makeScope('admin'));
		setLastActiveScopeName('landing');

		await applyActiveScopeOnNavigation('/admin/users');
		expect(getLastActiveScopeName()).toBe('admin');

		await applyActiveScopeOnNavigation('/');
		expect(getLastActiveScopeName()).toBe('landing');
	});

	it('does not update when staying in the same scope', async () => {
		register('admin', '/admin', makeScope('admin'));
		setLastActiveScopeName('admin');

		await applyActiveScopeOnNavigation('/admin/settings');
		expect(getLastActiveScopeName()).toBe('admin');
	});

	it('falls back to the first scope when nothing matches', async () => {
		register('home', '/home', makeScope('home'));
		register('admin', '/admin', makeScope('admin'));
		setLastActiveScopeName(null);

		await applyActiveScopeOnNavigation('/nowhere');
		expect(getLastActiveScopeName()).toBe('home');
	});

	it('is a no-op when no scopes are registered', async () => {
		setLastActiveScopeName(null);
		await applyActiveScopeOnNavigation('/anywhere');
		expect(getLastActiveScopeName()).toBe(null);
	});

	it('clearRegistry resets last-active', () => {
		setLastActiveScopeName('something');
		clearRegistry();
		expect(getLastActiveScopeName()).toBe(null);
	});
});
