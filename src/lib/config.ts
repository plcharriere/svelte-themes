import type { ResolvedThemesConfig } from './types.js';

let config: ResolvedThemesConfig | null = null;
const cache = new Map<string, Promise<string>>();

export function setConfig(c: ResolvedThemesConfig): void {
	config = c;
	cache.clear();
}

export function getConfig(): ResolvedThemesConfig {
	if (!config) {
		throw new Error('svelte-themes: createThemes() was not called');
	}
	return config;
}

export function loadCss(name: string): Promise<string> {
	let promise = cache.get(name);
	if (!promise) {
		const cfg = getConfig();
		promise = cfg.themes[name]()
			.then((mod) => {
				const css = typeof mod === 'string' ? mod : mod.default;
				if (typeof css !== 'string') {
					throw new Error(`Theme "${name}" did not export a CSS string`);
				}
				return css;
			})
			.catch((err) => {
				cache.delete(name);
				throw err;
			});
		cache.set(name, promise);
	}
	return promise;
}
