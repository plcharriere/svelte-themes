import type { AxisConfig } from './core.svelte.js';
import type { NormalizedThemes } from './normalize.js';

export const COOKIE_NAME_RE = /^[A-Za-z0-9_-]+$/;

/**
 * Turn a scope's normalized themes into fully-resolved `AxisConfig`s — computing
 * each axis's `<style>` id, theme cookie name, default theme, and cache prefix —
 * and validate axis/theme names and defaults along the way.
 *
 * Cookie naming (leading token = `cookieTheme`, default `theme`):
 *   flat,  no scope   → `theme`
 *   axed,  no scope   → `theme-${axis}`
 *   flat,  scope      → `theme-${scope}`
 *   axed,  scope      → `theme-${scope}-${axis}`
 */
export function buildAxisConfigs(opts: {
	scopeName: string; // internal scope name, used for the cache-key prefix
	scopeSegment: string | null; // scope segment in cookies, or null (createThemes)
	norm: NormalizedThemes;
	defaultTheme?: string;
	defaultThemes?: Record<string, string>;
	cookieTheme: string;
	label: string;
}): AxisConfig[] {
	const { scopeName, scopeSegment, norm, defaultTheme, defaultThemes, cookieTheme, label } = opts;

	const seenThemeNames = new Set<string>();

	return norm.axes.map((axis): AxisConfig => {
		if (!COOKIE_NAME_RE.test(axis.name)) {
			throw new Error(`${label}: axis name "${axis.name}" must match ${COOKIE_NAME_RE}`);
		}

		const names = Object.keys(axis.themes);

		// Duplicate theme name across this scope's axes → ambiguous setTheme(name).
		for (const n of names) {
			if (seenThemeNames.has(n)) {
				throw new Error(`${label}: duplicate theme name "${n}" across axes`);
			}
			seenThemeNames.add(n);
		}

		// Resolve this axis's default theme.
		let def: string;
		if (norm.flat) {
			def = defaultTheme ?? names[0];
		} else {
			def = defaultThemes?.[axis.name] ?? names[0];
		}
		if (!Object.hasOwn(axis.themes, def)) {
			throw new Error(`${label}: defaultTheme "${def}" not found in axis "${axis.name}"`);
		}

		// Cookie name + style id.
		let cookieName: string;
		let styleId: string;
		if (norm.flat) {
			cookieName = scopeSegment === null ? cookieTheme : `${cookieTheme}-${scopeSegment}`;
			styleId = 'svelte-themes';
		} else {
			cookieName =
				scopeSegment === null
					? `${cookieTheme}-${axis.name}`
					: `${cookieTheme}-${scopeSegment}-${axis.name}`;
			styleId = `svelte-themes-${axis.name}`;
		}

		return {
			name: axis.name,
			themes: axis.themes,
			defaultTheme: def,
			styleId,
			cookieName,
			cacheKeyPrefix: `${scopeName}/${axis.name}`
		};
	});
}

/** Validate that `defaultThemes` keys all reference real axes. */
export function validateDefaultThemesKeys(
	norm: NormalizedThemes,
	defaultThemes: Record<string, string> | undefined,
	label: string
): void {
	if (!defaultThemes) return;
	const axisNames = new Set(norm.axes.map((a) => a.name));
	for (const key of Object.keys(defaultThemes)) {
		if (!axisNames.has(key)) {
			throw new Error(`${label}: defaultThemes references unknown axis "${key}"`);
		}
	}
}
