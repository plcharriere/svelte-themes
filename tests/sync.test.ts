import { describe, expect, it } from 'vitest';

import {
	buildSyncMessage,
	SHARED_SCHEME_SCOPE,
	shouldHandleSyncMessage,
	type SyncMessage
} from '../src/lib/core.svelte.js';

// ---------------------------------------------------------------------------
// buildSyncMessage — broadcast shape
// ---------------------------------------------------------------------------

describe('buildSyncMessage — theme', () => {
	it('tags with the broadcaster scope name (independent)', () => {
		const msg = buildSyncMessage('theme', 'admin', true, { name: 'graphite' });
		expect(msg).toEqual({ kind: 'theme', scope: 'admin', name: 'graphite' });
	});

	it('tags with the broadcaster scope name (shared-scheme scope)', () => {
		// Theme tagging never uses the @shared sentinel — only scheme does.
		const msg = buildSyncMessage('theme', 'landing', false, { name: 'ocean' });
		expect(msg).toEqual({ kind: 'theme', scope: 'landing', name: 'ocean' });
	});
});

describe('buildSyncMessage — scheme', () => {
	it('uses the scope name when the broadcaster owns its scheme', () => {
		const msg = buildSyncMessage('scheme', 'admin', true, { scheme: 'dark' });
		expect(msg).toEqual({ kind: 'scheme', scope: 'admin', scheme: 'dark' });
	});

	it('uses the @shared sentinel when the broadcaster shares the top-level scheme', () => {
		const msg = buildSyncMessage('scheme', 'landing', false, { scheme: 'light' });
		expect(msg).toEqual({
			kind: 'scheme',
			scope: SHARED_SCHEME_SCOPE,
			scheme: 'light'
		});
	});

	it('routes the system scheme through @shared too', () => {
		const msg = buildSyncMessage('scheme', 'landing', false, { scheme: 'system' });
		expect(msg).toEqual({
			kind: 'scheme',
			scope: SHARED_SCHEME_SCOPE,
			scheme: 'system'
		});
	});
});

// ---------------------------------------------------------------------------
// shouldHandleSyncMessage — receive filter
// ---------------------------------------------------------------------------

const independentLanding = { name: 'landing', independentScheme: true };
const independentAdmin = { name: 'admin', independentScheme: true };
const sharedLanding = { name: 'landing', independentScheme: false };
const sharedAdmin = { name: 'admin', independentScheme: false };

describe('shouldHandleSyncMessage — theme messages', () => {
	it('acts only when scope tag matches the receiver name', () => {
		const own: SyncMessage = { kind: 'theme', scope: 'landing', name: 'ocean' };
		expect(shouldHandleSyncMessage(independentLanding, own)).toBe(true);
		expect(shouldHandleSyncMessage(sharedLanding, own)).toBe(true);
	});

	it('ignores theme messages from a different scope', () => {
		const foreign: SyncMessage = { kind: 'theme', scope: 'admin', name: 'graphite' };
		expect(shouldHandleSyncMessage(independentLanding, foreign)).toBe(false);
		expect(shouldHandleSyncMessage(sharedLanding, foreign)).toBe(false);
	});

	it('never treats @shared as a wildcard for theme messages', () => {
		const sharedTag: SyncMessage = {
			kind: 'theme',
			scope: SHARED_SCHEME_SCOPE,
			name: 'ocean'
		};
		expect(shouldHandleSyncMessage(independentLanding, sharedTag)).toBe(false);
		expect(shouldHandleSyncMessage(sharedLanding, sharedTag)).toBe(false);
	});
});

describe('shouldHandleSyncMessage — scheme messages + independent receiver', () => {
	it('acts only when scope tag matches the receiver name', () => {
		const own: SyncMessage = { kind: 'scheme', scope: 'admin', scheme: 'dark' };
		expect(shouldHandleSyncMessage(independentAdmin, own)).toBe(true);
	});

	it('ignores scheme messages from a different independent scope', () => {
		const foreign: SyncMessage = {
			kind: 'scheme',
			scope: 'landing',
			scheme: 'light'
		};
		expect(shouldHandleSyncMessage(independentAdmin, foreign)).toBe(false);
	});

	it('ignores shared-scheme broadcasts when the receiver is independent', () => {
		const shared: SyncMessage = {
			kind: 'scheme',
			scope: SHARED_SCHEME_SCOPE,
			scheme: 'dark'
		};
		expect(shouldHandleSyncMessage(independentAdmin, shared)).toBe(false);
	});
});

describe('shouldHandleSyncMessage — scheme messages + shared receiver', () => {
	it('acts only on @shared scheme broadcasts', () => {
		const shared: SyncMessage = {
			kind: 'scheme',
			scope: SHARED_SCHEME_SCOPE,
			scheme: 'dark'
		};
		expect(shouldHandleSyncMessage(sharedLanding, shared)).toBe(true);
		expect(shouldHandleSyncMessage(sharedAdmin, shared)).toBe(true);
	});

	it('ignores scheme messages tagged with a real scope name', () => {
		const fromIndependent: SyncMessage = {
			kind: 'scheme',
			scope: 'admin',
			scheme: 'dark'
		};
		expect(shouldHandleSyncMessage(sharedLanding, fromIndependent)).toBe(false);

		const selfTag: SyncMessage = {
			kind: 'scheme',
			scope: 'landing',
			scheme: 'dark'
		};
		expect(shouldHandleSyncMessage(sharedLanding, selfTag)).toBe(false);
	});
});

describe('shouldHandleSyncMessage — round-trip with buildSyncMessage', () => {
	it('two shared-scheme scopes hear each other’s scheme changes', () => {
		const broadcast = buildSyncMessage('scheme', 'landing', false, {
			scheme: 'dark'
		});
		expect(shouldHandleSyncMessage(sharedAdmin, broadcast)).toBe(true);
	});

	it('an independent scope is isolated from a shared scope’s scheme change', () => {
		const broadcast = buildSyncMessage('scheme', 'landing', false, {
			scheme: 'dark'
		});
		expect(shouldHandleSyncMessage(independentAdmin, broadcast)).toBe(false);
	});

	it('an independent scope only reacts to its own scheme broadcasts', () => {
		const own = buildSyncMessage('scheme', 'admin', true, { scheme: 'dark' });
		const other = buildSyncMessage('scheme', 'landing', true, { scheme: 'dark' });
		expect(shouldHandleSyncMessage(independentAdmin, own)).toBe(true);
		expect(shouldHandleSyncMessage(independentAdmin, other)).toBe(false);
	});

	it('theme broadcasts never leak across scopes', () => {
		const landingTheme = buildSyncMessage('theme', 'landing', false, {
			name: 'ocean'
		});
		const adminTheme = buildSyncMessage('theme', 'admin', true, {
			name: 'graphite'
		});
		expect(shouldHandleSyncMessage(sharedAdmin, landingTheme)).toBe(false);
		expect(shouldHandleSyncMessage(independentLanding, adminTheme)).toBe(false);
		expect(shouldHandleSyncMessage(sharedLanding, landingTheme)).toBe(true);
		expect(shouldHandleSyncMessage(independentAdmin, adminTheme)).toBe(true);
	});
});
