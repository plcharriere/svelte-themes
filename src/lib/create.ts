import { setConfig } from './config.js';
import { initClient } from './theme.svelte.js';
import type { ThemesConfig } from './types.js';

const COOKIE_NAME_RE = /^[A-Za-z0-9_-]+$/;

export function createThemes(options: ThemesConfig): void {
	const names = Object.keys(options.themes);
	if (names.length === 0) {
		throw new Error('createThemes: no themes provided');
	}
	const defaultTheme = options.defaultTheme ?? names[0];
	if (!Object.hasOwn(options.themes, defaultTheme)) {
		throw new Error(`createThemes: defaultTheme "${defaultTheme}" not found`);
	}
	const cookieTheme = options.cookieTheme ?? 'theme';
	const cookieScheme = options.cookieScheme ?? 'scheme';
	if (!COOKIE_NAME_RE.test(cookieTheme)) {
		throw new Error(
			`createThemes: cookieTheme "${cookieTheme}" must match ${COOKIE_NAME_RE}`
		);
	}
	if (!COOKIE_NAME_RE.test(cookieScheme)) {
		throw new Error(
			`createThemes: cookieScheme "${cookieScheme}" must match ${COOKIE_NAME_RE}`
		);
	}
	setConfig({
		themes: options.themes,
		defaultTheme,
		defaultScheme: options.defaultScheme ?? 'system',
		cookieTheme,
		cookieScheme,
		syncTabs: options.syncTabs ?? true,
		syncChannel: options.syncChannel ?? 'svelte-themes'
	});
	initClient();
}
