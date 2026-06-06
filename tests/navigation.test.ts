import { beforeEach, describe, expect, it, vi } from 'vitest';

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

	it('serializes overlapping navigations — each apply completes before the next starts', async () => {
		const landing = makeScope('landing');
		const admin = makeScope('admin');
		registerScope(landing);
		registerScopeMatcher('landing', '/');
		registerScope(admin);
		registerScopeMatcher('admin', '/admin');
		setLastActiveScopeName('landing');

		// Wrap each scope's apply so we can observe ordering. The inner
		// `await` yields a microtask — if navigations ran concurrently the
		// two applies would interleave (start:admin, start:landing, …).
		const events: string[] = [];
		const wrap = (scope: ThemeScope, label: string) => {
			const orig = scope.applyStateFromCookies.bind(scope);
			scope.applyStateFromCookies = async () => {
				events.push(`start:${label}`);
				await Promise.resolve();
				await orig();
				events.push(`end:${label}`);
			};
		};
		wrap(landing, 'landing');
		wrap(admin, 'admin');

		// Fire two overlapping cross-scope navigations without awaiting between.
		const p1 = applyActiveScopeOnNavigation('/admin'); // landing → admin
		const p2 = applyActiveScopeOnNavigation('/'); // admin → landing
		await Promise.all([p1, p2]);

		expect(events).toEqual(['start:admin', 'end:admin', 'start:landing', 'end:landing']);
		expect(getLastActiveScopeName()).toBe('landing');
	});

	it('a failed navigation apply does not poison the chain', async () => {
		const landing = makeScope('landing');
		const admin = makeScope('admin');
		registerScope(landing);
		registerScopeMatcher('landing', '/');
		registerScope(admin);
		registerScopeMatcher('admin', '/admin');
		setLastActiveScopeName('landing');

		// First navigation's apply rejects; the chain must still process the next.
		admin.applyStateFromCookies = () => Promise.reject(new Error('boom'));
		const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		const p1 = applyActiveScopeOnNavigation('/admin'); // rejects internally
		const p2 = applyActiveScopeOnNavigation('/'); // must still run
		await Promise.all([p1, p2]);

		expect(getLastActiveScopeName()).toBe('landing');
		errSpy.mockRestore();
	});
});
