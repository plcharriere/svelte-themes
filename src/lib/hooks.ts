import type { Handle } from '@sveltejs/kit';
import { getConfig, loadCss } from './config.js';
import { runWithTheme } from './ssr-store.js';
import type { Scheme } from './types.js';

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

export function createThemesHandle(): Handle {
	return async ({ event, resolve }) => {
		const cfg = getConfig();

		const requested = event.cookies.get(cfg.cookieTheme);
		const hasThemeCookie = requested !== undefined && Object.hasOwn(cfg.themes, requested);
		const name = hasThemeCookie ? requested : cfg.defaultTheme;
		const themeSource: 'cookie' | 'default' = hasThemeCookie ? 'cookie' : 'default';

		const schemeCookie = event.cookies.get(cfg.cookieScheme);
		let dark: boolean;
		let scheme: Scheme;
		let schemeSource: 'cookie' | 'default';
		if (schemeCookie === 'dark') {
			dark = true;
			scheme = 'dark';
			schemeSource = 'cookie';
		} else if (schemeCookie === 'light') {
			dark = false;
			scheme = 'light';
			schemeSource = 'cookie';
		} else if (schemeCookie === 'system') {
			const hint = event.request.headers.get('sec-ch-prefers-color-scheme');
			dark = hint === 'dark';
			scheme = 'system';
			schemeSource = 'cookie';
		} else if (cfg.defaultScheme === 'system') {
			const hint = event.request.headers.get('sec-ch-prefers-color-scheme');
			dark = hint === 'dark';
			scheme = 'system';
			schemeSource = 'default';
		} else {
			scheme = cfg.defaultScheme;
			dark = scheme === 'dark';
			schemeSource = 'default';
		}

		event.setHeaders({
			'Accept-CH': 'Sec-CH-Prefers-Color-Scheme',
			Vary: 'Cookie, Sec-CH-Prefers-Color-Scheme'
		});

		const css = await loadCss(name);
		const safeCss = css.replace(/<\/style>/gi, '<\\/style>');
		const safeName = htmlAttrEscape(name);
		const bootScript = buildBootScript(cfg.cookieScheme, cfg.defaultScheme === 'system');

		return runWithTheme({ theme: name, themeSource, dark, scheme, schemeSource }, () =>
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
