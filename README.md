# svelte-themes

SSR-safe, cookie-persisted theme switching for **SvelteKit 2 + Svelte 5**. Themes are plain CSS files, lazy-loaded on demand, with light/dark as an independent toggle that respects `prefers-color-scheme` until the user explicitly chooses.

```ts
setTheme('bubblegum');           // switch theme, persist via cookie
setScheme('dark');               // scheme is independent of theme
setScheme('system');             // follow OS prefers-color-scheme
toggleScheme();                  // flip between 'light' and 'dark'
setTheme('candyland', 'dark');   // switch theme + scheme in one call
```

No flash on reload. The active theme's CSS is read from a cookie server-side and inlined into the HTML before the page ships.

## Install

```sh
npm install @plcharriere/svelte-themes
```

```sh
pnpm add @plcharriere/svelte-themes
```

```sh
yarn add @plcharriere/svelte-themes
```

```sh
bun add @plcharriere/svelte-themes
```

## Usage

### 1. Write your themes as plain CSS

A theme is a CSS file that defines variables on `:root` (and optionally on `.dark` for the dark variant). Drop them anywhere in your project — the convention is `src/themes/`.

```css
/* src/themes/bubblegum.css */
:root {
  --background: oklch(0.94 0.02 345);
  --foreground: oklch(0.47 0 0);
  --primary: oklch(0.62 0.18 348);
  /* ... */
}

.dark {
  --background: oklch(0.25 0.03 234);
  --foreground: oklch(0.93 0.02 349);
  --primary: oklch(0.92 0.08 87);
  /* ... */
}
```

Each theme file is self-contained — bring your own Tailwind import, `@theme inline {}` mapping, base layer, whatever. The library only swaps the file's content into a single `<style>` tag.

### 2. Register your themes

```ts
// src/themes.ts
import { createThemes } from '@plcharriere/svelte-themes';

createThemes({
  themes: {
    bubblegum: () => import('./themes/bubblegum.css?inline'),
    candyland: () => import('./themes/candyland.css?inline')
  },
  defaultTheme: 'bubblegum',
  defaultScheme: 'system'
});
```

Each theme is a dynamic import. Vite emits one chunk per theme — only the active one is loaded on the server, only the one being switched to is fetched on the client.

### 3. Wire SvelteKit

```ts
// src/hooks.server.ts
import './themes';
import { createThemesHandle } from '@plcharriere/svelte-themes/server';

export const handle = createThemesHandle();
```

```svelte
<!-- src/routes/+layout.svelte -->
<script>
  import '../themes';

  let { children } = $props();
</script>

{@render children()}
```

```html
<!-- src/app.html -->
<!doctype html>
<html lang="en" data-theme="%theme%" class="%dark%">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style id="svelte-themes">%theme-css%</style>
    %sveltekit.head%
  </head>
  <body data-sveltekit-preload-data="hover">
    <div style="display: contents">%sveltekit.body%</div>
  </body>
</html>
```

Three placeholders are filled by the handle on every request: `%theme%` (theme name), `%dark%` (`dark` or empty), and `%theme-css%` (the active theme's CSS). The handle also auto-injects a tiny boot script before `</head>` that fixes up the `dark` class from `prefers-color-scheme` whenever the user is in system mode (cookie `scheme=system` or no cookie + `defaultScheme: 'system'`) — runs before paint, so no flash.

### 4. Switch themes

```svelte
<script>
  import {
    getThemes,
    getCurrentTheme,
    setTheme,
    isDark,
    getScheme,
    setScheme,
    toggleScheme
  } from '@plcharriere/svelte-themes';
</script>

<select onchange={(e) => setTheme(e.currentTarget.value)} value={getCurrentTheme()}>
  {#each getThemes() as name}
    <option value={name}>{name}</option>
  {/each}
</select>

<button onclick={toggleScheme}>
  Toggle <span class="dark:hidden">dark</span><span class="hidden dark:inline">light</span>
</button>
<button onclick={() => setScheme('system')}>System</button>

<!-- 3-way Light / Dark / System select -->
<select onchange={(e) => setScheme(e.currentTarget.value)} value={getScheme()}>
  <option value="light">Light</option>
  <option value="dark">Dark</option>
  <option value="system">System</option>
</select>
```

`setTheme` and `setScheme` write the configured cookies (defaults `theme` and `scheme`) so the choice survives reloads. `setScheme('system')` writes `scheme=system` and applies `prefers-color-scheme`. The active theme's CSS swaps in instantly via the `<style id="svelte-themes">` element the server already rendered. The `getCurrentTheme()` / `isDark()` / `getScheme()` reads in the template above are reactive — when another tab broadcasts a change, the select's `value` and the dark/light label flip without any extra wiring.

For each axis, three accessors give you current value, default, and source:

**Theme**

- **`getCurrentTheme()`** → `string` — the active theme name.
- **`getDefaultTheme()`** → `string` — the configured default. Useful for a "Reset to default" button without hardcoding the name.
- **`getThemeSource()`** → `'cookie' | 'default'` — `'cookie'` if the user explicitly picked a theme, `'default'` if no cookie is set and `defaultTheme` is being used.

**Scheme**

- **`isDark()`** → `boolean` — the **resolved** dark state. Always a boolean, regardless of how it was decided. Use for visual logic ("show the moon icon").
- **`getScheme()`** → `'light' | 'dark' | 'system'` — the **value** the user (or config) chose. Returns `'system'` when the user is following the OS, `'light'`/`'dark'` when they explicitly picked. Use for binding a 3-way Light / Dark / System control.
- **`getDefaultScheme()`** → `'light' | 'dark' | 'system'` — the configured default.
- **`getSchemeSource()`** → `'cookie' | 'default'` — `'cookie'` if the user explicitly chose anything (including `'system'`), `'default'` if no cookie is set and `defaultScheme` is being used.

```svelte
<button onclick={() => { setTheme(getDefaultTheme()); setScheme(getDefaultScheme()); }}>
  Reset to defaults
</button>
```

### Loading state

Theme chunks are dynamic imports — the **first** switch to a theme fetches its CSS chunk over the network. While that's in flight you can show a loading indicator:

```svelte
<script>
  import { isLoadingTheme, getLoadingTheme, setTheme } from '@plcharriere/svelte-themes';
</script>

<!-- global progress bar — shown while any theme is loading -->
{#if isLoadingTheme()}
  <div class="fixed top-0 inset-x-0 h-1 bg-primary z-50 animate-pulse"></div>
{/if}

<!-- per-button spinner — shown only on the button being loaded -->
{#each getThemes() as name}
  <button onclick={() => setTheme(name)}>
    {name}
    {#if isLoadingTheme(name)}
      <svg class="animate-spin w-3 h-3"><!-- ... --></svg>
    {/if}
  </button>
{/each}

<!-- or read the loading name as a string -->
{#if getLoadingTheme()}
  <p>Loading {getLoadingTheme()}…</p>
{/if}
```

Both functions also fire when **another tab** broadcasts a theme change and this tab needs to fetch the chunk to keep up. After cache, switching is instant and these stay false.

## Features

- **SSR-safe** — the active theme's CSS is inlined into the HTML on the server. No flash on reload.
- **Cookie-persisted** — the choice survives reloads and works across server and client without `localStorage` hacks.
- **Respects `prefers-color-scheme`** — when the user is in system mode (default, or `setScheme('system')`), the library reads the `Sec-CH-Prefers-Color-Scheme` client hint server-side, falls back to a tiny boot script, and listens for live OS changes while the page is open. Set `defaultScheme: 'light'` or `'dark'` to ignore the OS preference for first-time visitors; users can still opt into system at any point via `setScheme('system')`.
- **Cross-tab sync** — switching theme or scheme in one tab updates every other open tab live via `BroadcastChannel`. Toggleable.
- **Reactive reads** — `getCurrentTheme()`, `getThemeSource()`, `isDark()`, `getScheme()`, `getSchemeSource()`, `isLoadingTheme()`, and `getLoadingTheme()` are backed by Svelte 5 runes. Read them in a template, `$derived`, or `$effect` and your UI tracks the value automatically — cross-tab updates, OS preference changes, and in-flight theme loads all flow into your components with no manual subscription.
- **Lazy-loaded** — each theme is a dynamic import. The server only loads the active theme; the client only fetches a theme on first switch, then caches it.
- **Plain CSS** — themes are CSS files. Bring your own variables, your own Tailwind setup, your own conventions.
- **Independent scheme toggle** — `dark` is a class on `<html>`, orthogonal to the theme name. Combine freely.

## API

### Setup

| Export | Purpose |
| --- | --- |
| `createThemes(config)` | Register themes, default theme, default scheme. |
| `createThemesHandle()` | Server entry (`@plcharriere/svelte-themes/server`). |

### Theme

| Export | Purpose |
| --- | --- |
| `setTheme(name, scheme?)` | Switch theme, optionally also set scheme. Async. |
| `getThemes()` | All registered theme names. |
| `getCurrentTheme()` | Active theme name. |
| `getDefaultTheme()` | Configured default theme name. |
| `getThemeSource()` | `'cookie'` (user picked) / `'default'` (config fallback). |

### Scheme

| Export | Purpose |
| --- | --- |
| `setScheme(scheme)` | Set scheme. `scheme: 'light' \| 'dark' \| 'system'`. |
| `toggleScheme()` | Flip between `'light'` and `'dark'`. |
| `getScheme()` | The chosen value — `'light'` / `'dark'` / `'system'`. |
| `getDefaultScheme()` | Configured default scheme. |
| `getSchemeSource()` | `'cookie'` (user picked) / `'default'` (config fallback). |
| `isDark()` | Resolved dark state — always boolean. |

### Loading

| Export | Purpose |
| --- | --- |
| `isLoadingTheme(name?)` | `true` while a theme chunk is in-flight. Pass a name to scope. |
| `getLoadingTheme()` | Name of the theme currently loading, or `null`. |

## Config options

```ts
createThemes({
  themes: {
    name: () => import('./path-to-theme.css?inline')
  },
  defaultTheme: 'name',         // optional — falls back to the first theme
  defaultScheme: 'system',      // 'system' | 'light' | 'dark' (default 'system')
  cookieTheme: 'theme',         // optional — cookie name for the active theme
  cookieScheme: 'scheme',       // optional — cookie name for the scheme
  syncTabs: true,               // optional — broadcast changes to other tabs
  syncChannel: 'svelte-themes'  // optional — BroadcastChannel name
});
```

`defaultScheme` decides what first-time visitors (no cookie) see:

- `'system'` (default) — follow `prefers-color-scheme`. Server reads the `Sec-CH-Prefers-Color-Scheme` client hint; the boot script and `matchMedia` listener cover browsers that don't send it.
- `'light'` / `'dark'` — force light or dark for first-time visitors, ignoring the OS preference.

`setScheme('system')` is **always allowed**, regardless of `defaultScheme`. The user's choice is persisted as `scheme=system` in the cookie and survives reloads.

`cookieTheme` and `cookieScheme` let you rename the cookies (e.g. to `app-theme` / `app-scheme`) to avoid collisions with other libs or tenants on the same domain. Both client and server read from these names, and the auto-injected boot script picks up the resolved name automatically. Names must match `^[A-Za-z0-9_-]+$` (RFC 6265 token subset) — the lib throws at `createThemes` otherwise.

`syncTabs` enables live cross-tab updates via `BroadcastChannel` — when one tab calls `setTheme`, `setScheme`, or `toggleScheme`, every other open tab applies the change immediately. Set to `false` to disable. `syncChannel` only matters if you have multiple apps on the same origin (e.g. `/app1` and `/app2`) and want to keep them isolated; otherwise the default is fine.

## How it works

For each request the handle decides on a theme + scheme by reading the `theme` and `scheme` cookies (configurable names):

1. **Theme cookie** — if set and known, use it. Otherwise fall back to `defaultTheme`.
2. **Scheme cookie** — has three valid values:
   - `'dark'` → force dark
   - `'light'` → force light
   - `'system'` → follow OS prefs (read `Sec-CH-Prefers-Color-Scheme` request header)
3. **No scheme cookie** — fall back to `defaultScheme`:
   - `'system'` → follow OS prefs (same as cookie `'system'`)
   - `'light'` / `'dark'` → use that

The handle loads the matching theme CSS lazily, inlines it into `%theme-css%`, sets `%theme%` / `%dark%` on `<html>`, and emits `Accept-CH: Sec-CH-Prefers-Color-Scheme` so the next request carries the hint. By the time the HTML reaches the browser, the right theme is already painted.

A tiny boot script is auto-injected by the handle right before `</head>`. It runs synchronously before paint, and toggles the `dark` class from `matchMedia('(prefers-color-scheme: dark)')` when the user is in system mode (cookie `'system'` or no cookie + `defaultScheme: 'system'`) — covers first-ever visits and browsers that don't send the client hint. The configured `cookieScheme` name is baked into the script per request. A `matchMedia` listener on the client keeps the class updated if the OS preference changes mid-session.

On the client, `setTheme(name)` writes the theme cookie. `setScheme('light' | 'dark' | 'system')` writes `scheme=light`, `scheme=dark`, or `scheme=system`. All persist across reloads — the server reads the cookie next request and renders the matching state.

When `syncTabs` is enabled (the default), each `setTheme` / `setScheme` / `toggleScheme` also posts a message on a `BroadcastChannel`. Other tabs of the same origin receive the message, validate it, and apply the change locally — without re-broadcasting or re-writing cookies, so there's no echo. `BroadcastChannel` is already same-origin scoped, so messages can't cross between sites.

## License

MIT
