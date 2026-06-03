import { getActiveScope, type ThemeScope } from './core.svelte.js';
import type { Scheme } from './types.js';

function active(): ThemeScope {
	const scope = getActiveScope();
	if (!scope) {
		throw new Error('svelte-themes: createThemes() was not called');
	}
	return scope;
}

// Root dispatchers route to the active scope. They're loosely typed (the active
// scope's flat/axed shape isn't known at compile time) — flat scopes return
// scalars, axed scopes return per-axis objects.

export function getThemes(): string[] | Record<string, string[]> {
	return active().getThemes();
}

export function getCurrentTheme(): string | Record<string, string> {
	return active().getCurrentTheme();
}

export function getDefaultTheme(): string | Record<string, string> {
	return active().getDefaultTheme();
}

export function getThemeSource(): ('cookie' | 'default') | Record<string, 'cookie' | 'default'> {
	return active().getThemeSource();
}

export function setTheme(name: string, scheme?: Scheme): Promise<void> {
	return active().setTheme(name, scheme);
}

export function isLoadingTheme(name?: string): boolean {
	return active().isLoadingTheme(name);
}

export function getLoadingTheme(): string | null | Record<string, string> {
	return active().getLoadingTheme();
}

export function isDark(): boolean {
	return active().isDark();
}

export function getScheme(): Scheme {
	return active().getScheme();
}

export function getDefaultScheme(): Scheme {
	return active().getDefaultScheme();
}

export function getSchemeSource(): 'cookie' | 'default' {
	return active().getSchemeSource();
}

export function setScheme(scheme: Scheme): void {
	active().setScheme(scheme);
}

export function toggleScheme(): void {
	active().toggleScheme();
}
