import { beforeEach, describe, expect, it } from 'vitest';

import {
	applyActiveScopeOnNavigation,
	clearRegistry,
	getLastActiveScopeName,
	registerScope,
	registerScopeMatcher,
	setLastActiveScopeName,
	shouldSwapOnNavigation,
	ThemeScope
} from '../src/lib/core.svelte.js';
import type { Matcher, ThemeLoader } from '../src/lib/types.js';

const css = (s: string): ThemeLoader => () => Promise.resolve(s);

beforeEach(() => clearRegistry());

function makeScope(name: string): ThemeScope {
	return new ThemeScope({
		name,
		flat: true,
		axes: [
			{
				name: 'default',
				themes: { only: css(':root {}') },
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
	registerScope(makeScope(name));
	registerScopeMatcher(name, matcher);
}

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

	it('returns false when both prev and next are null', () => {
		expect(shouldSwapOnNavigation(null, null)).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// applyActiveScopeOnNavigation — scope bookkeeping only (no DOM in node)
// ---------------------------------------------------------------------------
//
// In the node test env there is no `document`, so `applyStateFromCookies` and
// `initClient` are no-ops; only the last-active-scope tracking is observable.

describe('applyActiveScopeOnNavigation — scope tracking', () => {
	it('updates last-active when crossing scopes', async () => {
		register('landing', '/');
		register('admin', '/admin');
		setLastActiveScopeName('landing');

		await applyActiveScopeOnNavigation('/admin/users');
		expect(getLastActiveScopeName()).toBe('admin');

		await applyActiveScopeOnNavigation('/');
		expect(getLastActiveScopeName()).toBe('landing');
	});

	it('does not change last-active when staying within the same scope', async () => {
		register('admin', '/admin');
		setLastActiveScopeName('admin');

		await applyActiveScopeOnNavigation('/admin/settings');
		expect(getLastActiveScopeName()).toBe('admin');
	});

	it('falls back to the first scope when nothing matches', async () => {
		register('home', '/home');
		register('admin', '/admin');
		setLastActiveScopeName(null);

		await applyActiveScopeOnNavigation('/nowhere');
		expect(getLastActiveScopeName()).toBe('home');
	});

	it('is a no-op when no scopes are registered', async () => {
		setLastActiveScopeName(null);
		await applyActiveScopeOnNavigation('/anywhere');
		expect(getLastActiveScopeName()).toBeNull();
	});

	it('clearRegistry resets last-active', () => {
		setLastActiveScopeName('something');
		clearRegistry();
		expect(getLastActiveScopeName()).toBeNull();
	});
});
