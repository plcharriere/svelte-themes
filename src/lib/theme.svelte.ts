import { getConfig, loadCss } from './config.js';
import { getServerTheme } from './ssr-store.js';
import type { Scheme } from './types.js';

type SyncMessage =
	| { kind: 'theme'; name: string }
	| { kind: 'scheme'; scheme: Scheme };

type SchemeCookieValue = Scheme | null;

let themeState = $state<string | null>(null);
let themeCookieValue = $state<string | null>(null);
let darkState = $state<boolean | null>(null);
let schemeCookieValue = $state<SchemeCookieValue>(null);
let pendingLoads = $state<number>(0);
let loadingName = $state<string | null>(null);

function regexEscape(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readSchemeCookie(): SchemeCookieValue {
	const re = new RegExp(`(?:^|;\\s*)${regexEscape(getConfig().cookieScheme)}=([^;]*)`);
	const m = document.cookie.match(re);
	if (!m) return null;
	const v = decodeURIComponent(m[1]);
	if (v === 'light' || v === 'dark' || v === 'system') return v;
	return null;
}

function readThemeCookie(): string | null {
	const cfg = getConfig();
	const re = new RegExp(`(?:^|;\\s*)${regexEscape(cfg.cookieTheme)}=([^;]*)`);
	const m = document.cookie.match(re);
	if (!m) return null;
	const v = decodeURIComponent(m[1]);
	return Object.hasOwn(cfg.themes, v) ? v : null;
}

function setCookie(name: string, value: string): void {
	const secure = location.protocol === 'https:' ? '; Secure' : '';
	document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=31536000; SameSite=Lax${secure}`;
}

function applyTheme(name: string, css: string): void {
	let style = document.getElementById('svelte-themes') as HTMLStyleElement | null;
	if (!style) {
		style = document.createElement('style');
		style.id = 'svelte-themes';
		document.head.appendChild(style);
	}
	style.textContent = css;
	document.documentElement.dataset.theme = name;
	themeState = name;
}

function applyDark(dark: boolean): void {
	document.documentElement.classList.toggle('dark', dark);
	darkState = dark;
}

let latestCall = 0;
let bc: BroadcastChannel | null = null;
let mql: MediaQueryList | null = null;
let mqlListener: ((e: MediaQueryListEvent) => void) | null = null;

export function getThemes(): string[] {
	return Object.keys(getConfig().themes);
}

export function getCurrentTheme(): string {
	if (typeof document === 'undefined') {
		return getServerTheme()?.theme ?? getConfig().defaultTheme;
	}
	return themeState ?? document.documentElement.dataset.theme ?? getConfig().defaultTheme;
}

export function getDefaultTheme(): string {
	return getConfig().defaultTheme;
}

export function getThemeSource(): 'cookie' | 'default' {
	if (typeof document === 'undefined') {
		return getServerTheme()?.themeSource ?? 'default';
	}
	return themeCookieValue === null ? 'default' : 'cookie';
}

export async function setTheme(name: string, scheme?: Scheme): Promise<void> {
	if (typeof document === 'undefined') return;
	const cfg = getConfig();
	if (!Object.hasOwn(cfg.themes, name)) {
		throw new Error(`Unknown theme: ${name}`);
	}
	const callId = ++latestCall;
	pendingLoads++;
	loadingName = name;
	try {
		const css = await loadCss(name);
		if (callId !== latestCall) return;
		applyTheme(name, css);
		setCookie(cfg.cookieTheme, name);
		themeCookieValue = name;
		bc?.postMessage({ kind: 'theme', name } satisfies SyncMessage);
		if (scheme !== undefined) setScheme(scheme);
	} finally {
		pendingLoads--;
		if (callId === latestCall) loadingName = null;
	}
}

export function isLoadingTheme(name?: string): boolean {
	if (name === undefined) return pendingLoads > 0;
	return loadingName === name;
}

export function getLoadingTheme(): string | null {
	return loadingName;
}

export function isDark(): boolean {
	if (typeof document === 'undefined') {
		const ss = getServerTheme();
		if (ss) return ss.dark;
		const ds = getConfig().defaultScheme;
		return ds === 'dark';
	}
	return darkState ?? document.documentElement.classList.contains('dark');
}

export function getScheme(): Scheme {
	const cfg = getConfig();
	if (typeof document === 'undefined') {
		const ss = getServerTheme();
		if (ss) return ss.scheme;
		return cfg.defaultScheme;
	}
	if (schemeCookieValue !== null) return schemeCookieValue;
	return cfg.defaultScheme;
}

export function getDefaultScheme(): Scheme {
	return getConfig().defaultScheme;
}

export function getSchemeSource(): 'cookie' | 'default' {
	if (typeof document === 'undefined') {
		return getServerTheme()?.schemeSource ?? 'default';
	}
	return schemeCookieValue === null ? 'default' : 'cookie';
}

export function setScheme(scheme: Scheme): void {
	if (typeof document === 'undefined') return;
	const cfg = getConfig();
	if (scheme === 'system') {
		setCookie(cfg.cookieScheme, 'system');
		schemeCookieValue = 'system';
		applyDark(matchMedia('(prefers-color-scheme: dark)').matches);
		bc?.postMessage({ kind: 'scheme', scheme: 'system' } satisfies SyncMessage);
		return;
	}
	applyDark(scheme === 'dark');
	setCookie(cfg.cookieScheme, scheme);
	schemeCookieValue = scheme;
	bc?.postMessage({ kind: 'scheme', scheme } satisfies SyncMessage);
}

export function toggleScheme(): void {
	setScheme(isDark() ? 'light' : 'dark');
}

export function initClient(): void {
	if (typeof window === 'undefined') return;

	if (mql && mqlListener) mql.removeEventListener('change', mqlListener);
	bc?.close();
	bc = null;

	themeState = document.documentElement.dataset.theme ?? null;
	themeCookieValue = readThemeCookie();
	darkState = document.documentElement.classList.contains('dark');
	schemeCookieValue = readSchemeCookie();

	const cfg = getConfig();

	mql = matchMedia('(prefers-color-scheme: dark)');
	mqlListener = (e) => {
		const v = readSchemeCookie();
		if (v === 'system' || (v === null && getConfig().defaultScheme === 'system')) {
			applyDark(e.matches);
		}
	};
	mql.addEventListener('change', mqlListener);

	if (cfg.syncTabs) {
		bc = new BroadcastChannel(cfg.syncChannel);
		bc.addEventListener('message', (e) => {
			const msg = e.data as SyncMessage | null;
			if (!msg || typeof msg !== 'object') return;
			if (msg.kind === 'scheme') {
				if (msg.scheme === 'system') {
					schemeCookieValue = 'system';
					applyDark(matchMedia('(prefers-color-scheme: dark)').matches);
					return;
				}
				if (msg.scheme === 'light' || msg.scheme === 'dark') {
					schemeCookieValue = msg.scheme;
					applyDark(msg.scheme === 'dark');
					return;
				}
			}
			if (
				msg.kind === 'theme' &&
				typeof msg.name === 'string' &&
				Object.hasOwn(getConfig().themes, msg.name)
			) {
				const callId = ++latestCall;
				pendingLoads++;
				loadingName = msg.name;
				loadCss(msg.name)
					.then((css) => {
						if (callId !== latestCall) return;
						applyTheme(msg.name, css);
						themeCookieValue = msg.name;
					})
					.catch((err) => {
						console.error('[svelte-themes] failed to apply broadcast theme:', err);
					})
					.finally(() => {
						pendingLoads--;
						if (callId === latestCall) loadingName = null;
					});
			}
		});
	}

	if (import.meta.hot) {
		import.meta.hot.dispose(() => {
			if (mql && mqlListener) mql.removeEventListener('change', mqlListener);
			bc?.close();
		});
	}
}
