import { BROWSER } from 'esm-env';

import type { Scheme } from './types.js';

type RequestState = {
	theme: string;
	dark: boolean;
	scheme: Scheme;
	schemeSource: 'cookie' | 'default';
};

type Storage = {
	run<T>(state: RequestState, fn: () => T): T;
	getStore(): RequestState | undefined;
};

let storage: Storage | null = null;

if (!BROWSER) {
	const mod = await import('node:async_hooks');
	const als = new mod.AsyncLocalStorage<RequestState>();
	storage = {
		run: (state, fn) => als.run(state, fn),
		getStore: () => als.getStore()
	};
}

export function runWithTheme<T>(state: RequestState, fn: () => T): T {
	return storage ? storage.run(state, fn) : fn();
}

export function getServerTheme(): RequestState | undefined {
	return storage?.getStore();
}
