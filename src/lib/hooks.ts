import { AsyncLocalStorage } from 'node:async_hooks';
import type { Handle } from '@sveltejs/kit';
import { loadCss } from './config.js';
import {
	getFirstScope,
	matchScope,
	registry,
	type ThemeScope
} from './core.svelte.js';
import { type RequestState, runWithTheme, setStorage } from './ssr-store.js';
import type { Scheme } from './types.js';

const als = new AsyncLocalStorage<RequestState>();
setStorage({
	run: (state, fn) => als.run(state, fn),
	getStore: () => als.getStore()
});

const HTML_ATTR_ESCAPES: Record<string, string> = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&#39;'
};

function htmlAttrEscape(s: string): string {
	return s.replace(/[&<>"']/g, (c) => HTML_ATTR_ESCAPES[c]);
}

function regexEscape(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildBootScript(cookieName: string, defaultIsSystem: boolean): string {
	const safe = regexEscape(cookieName);
	const fallback = defaultIsSystem ? 'true' : 'false';
	return `<script>(function(){try{var m=document.cookie.match(new RegExp('(?:^|;\\\\s*)${safe}=([^;]*)'));var v=m?m[1]:null;if(v==='system'||(v===null&&${fallback})){document.documentElement.classList.toggle('dark',matchMedia('(prefers-color-scheme: dark)').matches);}}catch(e){}})();</script>`;
}

/**
 * Pure theme resolver: given a scope's themes record + defaultTheme and the
 * raw cookie value (or undefined), return the resolved theme name and source.
 */
export function resolveTheme(
	themes: Record<string, unknown>,
	defaultTheme: string,
	cookieValue: string | undefined
): { name: string; themeSource: 'cookie' | 'default' } {
	const hasCookie =
		cookieValue !== undefined && Object.hasOwn(themes, cookieValue);
	if (hasCookie) {
		return { name: cookieValue, themeSource: 'cookie' };
	}
	return { name: defaultTheme, themeSource: 'default' };
}

/**
 * Pure scheme resolver: given the raw scheme cookie, the
 * `Sec-CH-Prefers-Color-Scheme` hint, and the default scheme, decide the
 * effective scheme, whether the dark class should be applied, and the source.
 */
export function resolveScheme(
	cookieValue: string | undefined,
	prefersColorSchemeHint: string | null,
	defaultScheme: Scheme
): { dark: boolean; scheme: Scheme; schemeSource: 'cookie' | 'default' } {
	if (cookieValue === 'dark') {
		return { dark: true, scheme: 'dark', schemeSource: 'cookie' };
	}
	if (cookieValue === 'light') {
		return { dark: false, scheme: 'light', schemeSource: 'cookie' };
	}
	if (cookieValue === 'system') {
		return {
			dark: prefersColorSchemeHint === 'dark',
			scheme: 'system',
			schemeSource: 'cookie'
		};
	}
	if (defaultScheme === 'system') {
		return {
			dark: prefersColorSchemeHint === 'dark',
			scheme: 'system',
			schemeSource: 'default'
		};
	}
	return {
		dark: defaultScheme === 'dark',
		scheme: defaultScheme,
		schemeSource: 'default'
	};
}

export function createThemesHandle(): Handle {
	return async ({ event, resolve }) => {
		if (registry.size === 0) {
			throw new Error('svelte-themes: createThemes() was not called');
		}

		const scope: ThemeScope | undefined =
			matchScope(event.url.pathname) ?? getFirstScope();
		if (!scope) {
			throw new Error('svelte-themes: no scopes registered');
		}
		const cfg = scope.config;

		const themeCookie = event.cookies.get(cfg.cookieTheme);
		const { name, themeSource } = resolveTheme(
			cfg.themes,
			cfg.defaultTheme,
			themeCookie
		);

		const schemeCookie = event.cookies.get(cfg.cookieScheme);
		const prefersColorSchemeHint = event.request.headers.get(
			'sec-ch-prefers-color-scheme'
		);
		const { dark, scheme, schemeSource } = resolveScheme(
			schemeCookie,
			prefersColorSchemeHint,
			cfg.defaultScheme
		);

		event.setHeaders({
			'Accept-CH': 'Sec-CH-Prefers-Color-Scheme',
			Vary: 'Cookie, Sec-CH-Prefers-Color-Scheme'
		});

		const css = await loadCss(name);
		const safeCss = css.replace(/<\/style>/gi, '<\\/style>');
		const safeName = htmlAttrEscape(name);
		const bootScript = buildBootScript(
			cfg.cookieScheme,
			cfg.defaultScheme === 'system'
		);

		return runWithTheme(
			{
				scopeName: cfg.name,
				theme: name,
				themeSource,
				dark,
				scheme,
				schemeSource
			},
			() =>
				resolve(event, {
					transformPageChunk: ({ html }) =>
						html
							.replace('%theme%', () => safeName)
							.replace('%dark%', () => (dark ? 'dark' : ''))
							.replace('%theme-css%', () => safeCss)
							.replace('</head>', () => `${bootScript}</head>`)
				})
		);
	};
}
