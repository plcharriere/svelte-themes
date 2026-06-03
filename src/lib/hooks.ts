import { AsyncLocalStorage } from 'node:async_hooks';
import type { Handle } from '@sveltejs/kit';
import { loadCss } from './config.js';
import { getFirstScope, matchScope, registry, type ThemeScope } from './core.svelte.js';
import { type AxisResolution, type RequestState, runWithTheme, setStorage } from './ssr-store.js';
import type { Scheme } from './types.js';

const als = new AsyncLocalStorage<RequestState>();
setStorage({
	run: (state, fn) => als.run(state, fn),
	getStore: () => als.getStore()
});

function regexEscape(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildBootScript(cookieName: string, defaultIsSystem: boolean): string {
	const safe = regexEscape(cookieName);
	const fallback = defaultIsSystem ? 'true' : 'false';
	return `<script>(function(){try{var m=document.cookie.match(new RegExp('(?:^|;\\\\s*)${safe}=([^;]*)'));var v=m?m[1]:null;if(v==='system'||(v===null&&${fallback})){document.documentElement.classList.toggle('dark',matchMedia('(prefers-color-scheme: dark)').matches);}}catch(e){}})();</script>`;
}

/** Pure theme resolver: given an axis's themes + default + raw cookie value. */
export function resolveTheme(
	themes: Record<string, unknown>,
	defaultTheme: string,
	cookieValue: string | undefined
): { name: string; themeSource: 'cookie' | 'default' } {
	if (cookieValue !== undefined && Object.hasOwn(themes, cookieValue)) {
		return { name: cookieValue, themeSource: 'cookie' };
	}
	return { name: defaultTheme, themeSource: 'default' };
}

/** Pure scheme resolver: raw cookie + Sec-CH hint + default → dark / scheme / source. */
export function resolveScheme(
	cookieValue: string | undefined,
	prefersColorSchemeHint: string | null,
	defaultScheme: Scheme
): { dark: boolean; scheme: Scheme; schemeSource: 'cookie' | 'default' } {
	if (cookieValue === 'dark') return { dark: true, scheme: 'dark', schemeSource: 'cookie' };
	if (cookieValue === 'light') return { dark: false, scheme: 'light', schemeSource: 'cookie' };
	if (cookieValue === 'system') {
		return { dark: prefersColorSchemeHint === 'dark', scheme: 'system', schemeSource: 'cookie' };
	}
	if (defaultScheme === 'system') {
		return { dark: prefersColorSchemeHint === 'dark', scheme: 'system', schemeSource: 'default' };
	}
	return { dark: defaultScheme === 'dark', scheme: defaultScheme, schemeSource: 'default' };
}

export function createThemesHandle(): Handle {
	return async ({ event, resolve }) => {
		if (registry.size === 0) {
			throw new Error('svelte-themes: createThemes() was not called');
		}

		const scope: ThemeScope | undefined = matchScope(event.url.pathname) ?? getFirstScope();
		if (!scope) throw new Error('svelte-themes: no scopes registered');
		const cfg = scope.config;

		// Resolve + load each axis, build its <style> tag.
		const themes: Record<string, AxisResolution> = {};
		const styleTags: string[] = [];
		for (const axis of cfg.axes) {
			const cookie = event.cookies.get(axis.cookieName);
			const { name, themeSource } = resolveTheme(axis.themes, axis.defaultTheme, cookie);
			themes[axis.name] = { name, source: themeSource };
			const css = await loadCss(`${cfg.name}/${axis.name}/${name}`, axis.themes[name]);
			const safeCss = css.replace(/<\/style>/gi, '<\\/style>');
			styleTags.push(`<style id="${axis.styleId}">${safeCss}</style>`);
		}

		const schemeCookie = event.cookies.get(cfg.cookieScheme);
		const hint = event.request.headers.get('sec-ch-prefers-color-scheme');
		const { dark, scheme, schemeSource } = resolveScheme(schemeCookie, hint, cfg.defaultScheme);

		event.setHeaders({
			'Accept-CH': 'Sec-CH-Prefers-Color-Scheme',
			Vary: 'Cookie, Sec-CH-Prefers-Color-Scheme'
		});

		const bootScript = buildBootScript(cfg.cookieScheme, cfg.defaultScheme === 'system');
		const head = `${styleTags.join('')}${bootScript}`;

		return runWithTheme(
			{ scopeName: cfg.name, themes, dark, scheme, schemeSource },
			() =>
				resolve(event, {
					transformPageChunk: ({ html }) =>
						html
							.replace('%dark%', () => (dark ? 'dark' : ''))
							.replace('</head>', () => `${head}</head>`)
				})
		);
	};
}
