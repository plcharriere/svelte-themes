import { getConfig, loadCss } from './config.js';
import { getServerTheme } from './ssr-store.js';

type SyncMessage =
	| { kind: 'theme'; name: string }
	| { kind: 'dark'; dark: boolean | 'system' };

let themeState = $state<string | null>(null);
let darkState = $state<boolean | null>(null);
let darkCookieSet = $state<boolean>(false);

function regexEscape(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasDarkCookie(): boolean {
	const re = new RegExp(`(?:^|;\\s*)${regexEscape(getConfig().cookieDark)}=`);
	return re.test(document.cookie);
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

export async function setTheme(name: string, dark?: boolean | 'system'): Promise<void> {
	if (typeof document === 'undefined') return;
	const cfg = getConfig();
	if (!Object.hasOwn(cfg.themes, name)) {
		throw new Error(`Unknown theme: ${name}`);
	}
	const callId = ++latestCall;
	const css = await loadCss(name);
	if (callId !== latestCall) return;
	applyTheme(name, css);
	setCookie(cfg.cookieTheme, name);
	bc?.postMessage({ kind: 'theme', name } satisfies SyncMessage);
	if (dark !== undefined) setDark(dark);
}

export function isDark(): boolean {
	if (typeof document === 'undefined') {
		return getServerTheme()?.dark ?? getConfig().defaultDark;
	}
	return darkState ?? document.documentElement.classList.contains('dark');
}

export function getDark(): boolean | 'system' {
	if (typeof document === 'undefined') {
		const ss = getServerTheme();
		if (ss?.darkSource === 'system') return 'system';
		return ss?.dark ?? getConfig().defaultDark;
	}
	return darkCookieSet ? (darkState ?? false) : 'system';
}

export function setDark(dark: boolean | 'system'): void {
	if (typeof document === 'undefined') return;
	const cfg = getConfig();
	if (dark === 'system') {
		document.cookie = `${cfg.cookieDark}=; path=/; max-age=0; SameSite=Lax`;
		darkCookieSet = false;
		const resolved = matchMedia('(prefers-color-scheme: dark)').matches;
		applyDark(resolved);
		bc?.postMessage({ kind: 'dark', dark: 'system' } satisfies SyncMessage);
		return;
	}
	applyDark(dark);
	setCookie(cfg.cookieDark, dark ? '1' : '0');
	darkCookieSet = true;
	bc?.postMessage({ kind: 'dark', dark } satisfies SyncMessage);
}

export function toggleDark(): void {
	setDark(!isDark());
}

export function initClient(): void {
	if (typeof window === 'undefined') return;

	if (mql && mqlListener) mql.removeEventListener('change', mqlListener);
	bc?.close();
	bc = null;

	themeState = document.documentElement.dataset.theme ?? null;
	darkState = document.documentElement.classList.contains('dark');
	darkCookieSet = hasDarkCookie();

	const cfg = getConfig();

	mql = matchMedia('(prefers-color-scheme: dark)');
	mqlListener = (e) => {
		if (!hasDarkCookie()) applyDark(e.matches);
	};
	mql.addEventListener('change', mqlListener);

	if (cfg.syncTabs) {
		bc = new BroadcastChannel(cfg.syncChannel);
		bc.addEventListener('message', (e) => {
			const msg = e.data as SyncMessage | null;
			if (!msg || typeof msg !== 'object') return;
			if (msg.kind === 'dark') {
				if (msg.dark === 'system') {
					darkCookieSet = false;
					applyDark(matchMedia('(prefers-color-scheme: dark)').matches);
					return;
				}
				if (typeof msg.dark === 'boolean') {
					darkCookieSet = true;
					applyDark(msg.dark);
					return;
				}
			}
			if (
				msg.kind === 'theme' &&
				typeof msg.name === 'string' &&
				Object.hasOwn(getConfig().themes, msg.name)
			) {
				const callId = ++latestCall;
				loadCss(msg.name)
					.then((css) => {
						if (callId !== latestCall) return;
						applyTheme(msg.name, css);
					})
					.catch((err) => {
						console.error('[svelte-themes] failed to apply broadcast theme:', err);
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
