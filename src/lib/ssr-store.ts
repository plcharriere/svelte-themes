import type { Scheme } from './types.js';

export type RequestState = {
	scopeName: string;
	theme: string;
	themeSource: 'cookie' | 'default';
	dark: boolean;
	scheme: Scheme;
	schemeSource: 'cookie' | 'default';
};

type Storage = {
	run<T>(state: RequestState, fn: () => T): T;
	getStore(): RequestState | undefined;
};

let storage: Storage = {
	run: (_state, fn) => fn(),
	getStore: () => undefined
};

export function setStorage(s: Storage): void {
	storage = s;
}

export function runWithTheme<T>(state: RequestState, fn: () => T): T {
	return storage.run(state, fn);
}

export function getServerTheme(): RequestState | undefined {
	return storage.getStore();
}
