import type { Handle } from '@sveltejs/kit';
import { getConfig, loadCss } from './config.js';
import { runWithTheme } from './ssr-store.js';

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

function buildBootScript(cookieName: string): string {
	const safe = regexEscape(cookieName);
	return `<script>(function(){try{if(!new RegExp('(?:^|;\\\\s*)${safe}=').test(document.cookie)){document.documentElement.classList.toggle('dark',matchMedia('(prefers-color-scheme: dark)').matches);}}catch(e){}})();</script>`;
}

export function createThemesHandle(): Handle {
	return async ({ event, resolve }) => {
		const cfg = getConfig();

		const requested = event.cookies.get(cfg.cookieTheme);
		const name =
			requested && Object.hasOwn(cfg.themes, requested) ? requested : cfg.defaultTheme;

		const darkCookie = event.cookies.get(cfg.cookieDark);
		let dark: boolean;
		let darkSource: 'cookie' | 'system';
		if (darkCookie === '1' || darkCookie === '0') {
			dark = darkCookie === '1';
			darkSource = 'cookie';
		} else {
			const hint = event.request.headers.get('sec-ch-prefers-color-scheme');
			dark = hint ? hint === 'dark' : cfg.defaultDark;
			darkSource = 'system';
		}

		event.setHeaders({
			'Accept-CH': 'Sec-CH-Prefers-Color-Scheme',
			Vary: 'Cookie, Sec-CH-Prefers-Color-Scheme'
		});

		const css = await loadCss(name);
		const safeCss = css.replace(/<\/style>/gi, '<\\/style>');
		const safeName = htmlAttrEscape(name);
		const bootScript = buildBootScript(cfg.cookieDark);

		return runWithTheme({ theme: name, dark, darkSource }, () =>
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
