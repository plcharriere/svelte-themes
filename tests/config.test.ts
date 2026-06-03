import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearCssCache, loadCss } from '../src/lib/config.js';
import type { ThemeLoader } from '../src/lib/types.js';

beforeEach(() => clearCssCache());

describe('loadCss — resolution + shape validation', () => {
	it('resolves a loader returning a raw CSS string', async () => {
		await expect(loadCss('k', () => Promise.resolve(':root { --x: 1; }'))).resolves.toBe(
			':root { --x: 1; }'
		);
	});

	it('unwraps a `{ default: string }` module shape', async () => {
		await expect(loadCss('k', () => Promise.resolve({ default: '.a {}' }))).resolves.toBe('.a {}');
	});

	it('throws (mentioning the key) when the loader yields a non-string', async () => {
		const bad: ThemeLoader = () => Promise.resolve(42 as unknown as string);
		await expect(loadCss('badkey', bad)).rejects.toThrow(
			/loader for "badkey" did not return a CSS string/
		);
	});

	it('throws when the module default is not a string', async () => {
		const bad: ThemeLoader = () =>
			Promise.resolve({ default: 99 } as unknown as { default: string });
		await expect(loadCss('k2', bad)).rejects.toThrow(/did not return a CSS string/);
	});
});

describe('loadCss — caching by key', () => {
	it('calls the loader once per key (dedupe)', async () => {
		const loader = vi.fn(() => Promise.resolve('css'));
		await loadCss('a', loader);
		await loadCss('a', loader);
		await loadCss('a', loader);
		expect(loader).toHaveBeenCalledTimes(1);
	});

	it('dedupes concurrent in-flight calls for the same key', async () => {
		const loader = vi.fn(() => Promise.resolve('css'));
		await Promise.all([loadCss('a', loader), loadCss('a', loader), loadCss('a', loader)]);
		expect(loader).toHaveBeenCalledTimes(1);
	});

	it('caches each key independently', async () => {
		const a = vi.fn(() => Promise.resolve('a-css'));
		const b = vi.fn(() => Promise.resolve('b-css'));
		await loadCss('a', a);
		await loadCss('a', a);
		await loadCss('b', b);
		expect(a).toHaveBeenCalledTimes(1);
		expect(b).toHaveBeenCalledTimes(1);
		await expect(loadCss('b', b)).resolves.toBe('b-css');
	});

	it('ignores a second loader passed for an already-cached key', async () => {
		await loadCss('a', () => Promise.resolve('first'));
		const second = vi.fn(() => Promise.resolve('second'));
		await expect(loadCss('a', second)).resolves.toBe('first');
		expect(second).not.toHaveBeenCalled();
	});
});

describe('loadCss — eviction on rejection', () => {
	it('evicts a failed entry so the next call retries', async () => {
		let calls = 0;
		const loader = vi.fn(() => {
			calls++;
			return calls === 1 ? Promise.reject(new Error('boom')) : Promise.resolve('ok');
		});
		await expect(loadCss('a', loader)).rejects.toThrow('boom');
		await expect(loadCss('a', loader)).resolves.toBe('ok');
		expect(loader).toHaveBeenCalledTimes(2);
	});

	it('evicts when the loader resolves to an invalid (non-string) shape', async () => {
		// An object whose `.default` is not a string trips the friendly check.
		const bad = vi.fn(() => Promise.resolve({} as unknown as { default: string }));
		await expect(loadCss('a', bad)).rejects.toThrow(/did not return a CSS string/);
		// Cache was evicted, so a subsequent good loader for the same key runs.
		const good = vi.fn(() => Promise.resolve('ok'));
		await expect(loadCss('a', good)).resolves.toBe('ok');
		expect(good).toHaveBeenCalledTimes(1);
	});
});

describe('clearCssCache', () => {
	it('drops cached entries so the next call re-invokes the loader', async () => {
		const loader = vi.fn(() => Promise.resolve('v1'));
		await loadCss('a', loader);
		clearCssCache();
		const loader2 = vi.fn(() => Promise.resolve('v2'));
		await expect(loadCss('a', loader2)).resolves.toBe('v2');
		expect(loader2).toHaveBeenCalledTimes(1);
	});
});
