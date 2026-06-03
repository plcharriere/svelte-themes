import type { ThemeLoader } from './types.js';

// Cache CSS by an opaque key (scope/axis/name) so scope-local theme names that
// happen to collide across scopes don't cross-serve. The loader is passed in by
// the caller (each axis owns its loaders) — no global config singleton.
const cache = new Map<string, Promise<string>>();

export function loadCss(key: string, loader: ThemeLoader): Promise<string> {
	let promise = cache.get(key);
	if (!promise) {
		promise = loader()
			.then((mod) => {
				const css = typeof mod === 'string' ? mod : mod.default;
				if (typeof css !== 'string') {
					throw new Error(`svelte-themes: loader for "${key}" did not return a CSS string`);
				}
				return css;
			})
			.catch((err) => {
				cache.delete(key);
				throw err;
			});
		cache.set(key, promise);
	}
	return promise;
}

/** Test helper — clear the CSS cache between runs. */
export function clearCssCache(): void {
	cache.clear();
}
