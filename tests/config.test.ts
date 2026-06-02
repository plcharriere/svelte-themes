import { beforeEach, describe, expect, it, vi } from 'vitest';

import { loadCss, setConfig } from '../src/lib/config.js';
import type { ThemeLoader } from '../src/lib/types.js';

function makeConfig(themes: Record<string, ThemeLoader>) {
	return {
		themes,
		defaultTheme: Object.keys(themes)[0] ?? '',
		defaultScheme: 'system' as const,
		cookieTheme: 'theme',
		cookieScheme: 'scheme',
		syncTabs: true,
		syncChannel: 'svelte-themes'
	};
}

describe('loadCss', () => {
	beforeEach(() => {
		setConfig(makeConfig({}));
	});

	it('resolves a theme to its CSS string', async () => {
		setConfig(makeConfig({ a: () => Promise.resolve(':root { --x: 1; }') }));
		await expect(loadCss('a')).resolves.toBe(':root { --x: 1; }');
	});

	it('unwraps a default-export module shape', async () => {
		setConfig(makeConfig({ a: () => Promise.resolve({ default: '.a {}' }) }));
		await expect(loadCss('a')).resolves.toBe('.a {}');
	});

	it('throws if the loader does not yield a string', async () => {
		setConfig(makeConfig({ a: () => Promise.resolve(42 as unknown as string) }));
		await expect(loadCss('a')).rejects.toThrow(/did not export a CSS string/);
	});

	it('caches the resolved promise — calls the loader once', async () => {
		const loader = vi.fn(() => Promise.resolve('css'));
		setConfig(makeConfig({ a: loader }));
		await loadCss('a');
		await loadCss('a');
		await loadCss('a');
		expect(loader).toHaveBeenCalledTimes(1);
	});

	it('evicts a failed entry so the next call retries', async () => {
		let calls = 0;
		const loader = vi.fn(() => {
			calls++;
			if (calls === 1) return Promise.reject(new Error('boom'));
			return Promise.resolve('ok');
		});
		setConfig(makeConfig({ a: loader }));
		await expect(loadCss('a')).rejects.toThrow('boom');
		await expect(loadCss('a')).resolves.toBe('ok');
		expect(loader).toHaveBeenCalledTimes(2);
	});

	it('caches per-theme independently', async () => {
		const a = vi.fn(() => Promise.resolve('a-css'));
		const b = vi.fn(() => Promise.resolve('b-css'));
		setConfig(makeConfig({ a, b }));
		await loadCss('a');
		await loadCss('a');
		await loadCss('b');
		expect(a).toHaveBeenCalledTimes(1);
		expect(b).toHaveBeenCalledTimes(1);
	});

	it('setConfig clears the cache', async () => {
		const loader = vi.fn(() => Promise.resolve('v1'));
		setConfig(makeConfig({ a: loader }));
		await loadCss('a');

		const loader2 = vi.fn(() => Promise.resolve('v2'));
		setConfig(makeConfig({ a: loader2 }));
		await expect(loadCss('a')).resolves.toBe('v2');
		expect(loader2).toHaveBeenCalledTimes(1);
	});
});
