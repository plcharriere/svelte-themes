# svelte-themes

SSR-safe, cookie-persisted theme switching for **SvelteKit 2 + Svelte 5**. Themes are plain CSS files, lazy-loaded on demand, with light/dark as an independent toggle that respects `prefers-color-scheme` until the user explicitly chooses.

```ts
setTheme('bubblegum');         // switch theme, persist via cookie
setDark(true);                 // dark/light is independent of theme
setDark('system');             // follow OS prefers-color-scheme
toggleDark();                  // flip current dark state
setTheme('candyland', true);   // switch theme + dark in one call
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
  defaultDark: false
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

Three placeholders are filled by the handle on every request: `%theme%` (theme name), `%dark%` (`dark` or empty), and `%theme-css%` (the active theme's CSS). The handle also auto-injects a tiny boot script before `</head>` that fixes up the `dark` class from `prefers-color-scheme` for first-time visitors who haven't set the dark cookie yet — runs before paint, so no flash.

### 4. Switch themes

```svelte
<script>
  import {
    getThemes,
    getCurrentTheme,
    setTheme,
    isDark,
    getDark,
    setDark,
    toggleDark
  } from '@plcharriere/svelte-themes';
</script>

<select onchange={(e) => setTheme(e.currentTarget.value)} value={getCurrentTheme()}>
  {#each getThemes() as name}
    <option value={name}>{name}</option>
  {/each}
</select>

<button onclick={toggleDark}>
  Toggle <span class="dark:hidden">dark</span><span class="hidden dark:inline">light</span>
</button>
<button onclick={() => setDark('system')}>System</button>

<!-- 3-way Light / Dark / System select -->
<select
  onchange={(e) => {
    const v = e.currentTarget.value;
    setDark(v === 'system' ? 'system' : v === 'true');
  }}
  value={String(getDark())}
>
  <option value="false">Light</option>
  <option value="true">Dark</option>
  <option value="system">System</option>
</select>
```

`setTheme` and `setDark` write the configured cookies (defaults `theme` and `theme-dark`) so the choice survives reloads. `setDark('system')` clears the dark cookie and applies `prefers-color-scheme`. The active theme's CSS swaps in instantly via the `<style id="svelte-themes">` element the server already rendered. The `getCurrentTheme()` / `isDark()` / `getDark()` reads in the template above are reactive — when another tab broadcasts a change, the select's `value` and the dark/light label flip without any extra wiring.

`isDark()` returns the **resolved** dark state (always a boolean, regardless of source). `getDark()` returns the **explicit** state — `true` / `false` for cookie, `'system'` for no cookie. Use `isDark()` for visual logic ("show the moon icon"), `getDark()` for binding 3-way controls.

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
- **Respects `prefers-color-scheme`** — first-time visitors get their OS preference. The library reads the `Sec-CH-Prefers-Color-Scheme` client hint server-side, falls back to a tiny boot script, and listens for live OS changes while the page is open. Cookie wins once the user explicitly toggles.
- **Cross-tab sync** — switching theme or dark in one tab updates every other open tab live via `BroadcastChannel`. Toggleable.
- **Reactive reads** — `getCurrentTheme()`, `isDark()`, `getDark()`, `isLoadingTheme()`, and `getLoadingTheme()` are backed by Svelte 5 runes. Read them in a template, `$derived`, or `$effect` and your UI tracks the value automatically — cross-tab updates, OS preference changes, and in-flight theme loads all flow into your components with no manual subscription.
- **Lazy-loaded** — each theme is a dynamic import. The server only loads the active theme; the client only fetches a theme on first switch, then caches it.
- **Plain CSS** — themes are CSS files. Bring your own variables, your own Tailwind setup, your own conventions.
- **Independent dark toggle** — `dark` is a class on `<html>`, orthogonal to the theme name. Combine freely.

## API

| Export | Purpose |
| --- | --- |
| `createThemes(config)` | Setup. Registers themes, default theme, default dark. |
| `setTheme(name, dark?)` | Switch theme, optionally also set dark (`boolean \| 'system'`). Async. |
| `setDark(dark)` | Set dark independently. `dark: boolean \| 'system'`. |
| `toggleDark()` | Flip the current dark state. |
| `getCurrentTheme()` | Active theme name. |
| `getThemes()` | All registered theme names. |
| `isDark()` | Resolved dark state — always boolean. |
| `getDark()` | Explicit choice — `true` / `false` / `'system'`. |
| `isLoadingTheme(name?)` | `true` while a theme chunk is in-flight. Pass a name to ask "is *this* theme loading?". |
| `getLoadingTheme()` | Name of the theme currently loading, or `null`. |

Server entry (`@plcharriere/svelte-themes/server`): `createThemesHandle()`.

## Config options

```ts
createThemes({
  themes: {
    name: () => import('./path-to-theme.css?inline')
  },
  defaultTheme: 'name',        // optional — falls back to the first theme
  defaultDark: false,          // optional — last-resort fallback only
  cookieTheme: 'theme',        // optional — cookie name for the active theme
  cookieDark: 'theme-dark',    // optional — cookie name for the dark flag
  syncTabs: true,              // optional — broadcast changes to other tabs
  syncChannel: 'svelte-themes' // optional — BroadcastChannel name
});
```

`defaultDark` is the **last-resort fallback** when neither a cookie nor `prefers-color-scheme` can be read. In practice, browsers expose the OS preference, so this rarely kicks in — first-time visitors normally get whatever their OS is set to, regardless of `defaultDark`.

`cookieTheme` and `cookieDark` let you rename the cookies (e.g. to `app-theme` / `app-theme-dark`) to avoid collisions with other libs or tenants on the same domain. Both client and server read from these names, and the auto-injected boot script picks up the resolved name automatically. Names must match `^[A-Za-z0-9_-]+$` (RFC 6265 token subset) — the lib throws at `createThemes` otherwise.

`syncTabs` enables live cross-tab updates via `BroadcastChannel` — when one tab calls `setTheme`, `setDark`, or `toggleDark`, every other open tab applies the change immediately. Set to `false` to disable. `syncChannel` only matters if you have multiple apps on the same origin (e.g. `/app1` and `/app2`) and want to keep them isolated; otherwise the default is fine.

## How it works

For each request the handle decides on a theme + dark in this order:

1. **Theme cookie** (default `theme`, configurable) — if set and known, use it. Otherwise fall back to `defaultTheme`.
2. **Dark cookie** (default `theme-dark`, configurable; value `'1'` / `'0'`) — if set, use it.
3. **`Sec-CH-Prefers-Color-Scheme` request header** — if the browser sent the client hint (Chrome and any browser that's been told via `Accept-CH` from a previous response), use it.
4. **`defaultDark`** — last-resort fallback.

The handle then loads the matching theme CSS lazily, inlines it into `%theme-css%`, sets `%theme%` / `%dark%` on `<html>`, and emits `Accept-CH: Sec-CH-Prefers-Color-Scheme` so the next request carries the hint. By the time the HTML reaches the browser, the right theme is already painted.

A tiny boot script is auto-injected by the handle right before `</head>`. It runs synchronously before paint, and toggles the `dark` class from `matchMedia('(prefers-color-scheme: dark)')` when no dark cookie is present — covers first-ever visits and browsers that don't send the client hint. The configured `cookieDark` name is baked into the script per request, so it stays in sync with `createThemes` automatically. A `matchMedia` listener on the client keeps the class updated if the user changes their OS preference while the page is open.

On the client, `setTheme(name)` and `setDark(bool)` write the same cookies and update the `<style>` element and `<html>` attributes the server originally rendered. The next reload reads those cookies — same result, no flash. `setDark('system')` deletes the dark cookie instead, so subsequent reloads (and the live `matchMedia` listener) follow the OS preference again.

When `syncTabs` is enabled (the default), each `setTheme` / `setDark` / `toggleDark` also posts a message on a `BroadcastChannel`. Other tabs of the same origin receive the message, validate it, and apply the change locally — without re-broadcasting or re-writing cookies, so there's no echo. `BroadcastChannel` is already same-origin scoped, so messages can't cross between sites.

## License

MIT
