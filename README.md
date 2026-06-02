# svelte-themes

SSR-safe, cookie-persisted theme switching for **SvelteKit 2 + Svelte 5**. Themes are plain CSS files, lazy-loaded on demand, with light/dark as an independent toggle that respects `prefers-color-scheme` until the user explicitly chooses. Optional **scoped themes** let `/` and `/admin` carry their own theme choices side-by-side. Cross-tab sync, no flash on reload.

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

## Quickstart

The 95% path: one set of themes for the whole app. Reach for [scoped themes](#scoped-themes) only when different sections of your site need independent theme choices.

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

export const {
  setTheme,
  getThemes,
  getCurrentTheme,
  getDefaultTheme,
  isLoadingTheme,
  getLoadingTheme
} = createThemes({
  themes: {
    bubblegum: () => import('./themes/bubblegum.css?inline'),
    candyland: () => import('./themes/candyland.css?inline')
  },
  defaultTheme: 'bubblegum',
  defaultScheme: 'system'
});
```

If different sections of your site need independent theme choices (e.g. a public landing surface and an admin surface), reach for [`createScopedThemes`](#scoped-themes) instead — same library, separate entry point so the scoped machinery only ends up in bundles that use it.

`createThemes` is generic over the themes record, so the returned `setTheme(name)`, `getCurrentTheme()`, etc. are typed against your specific theme names — `setTheme('blubgegum')` is a TS error, autocomplete works, switch statements narrow correctly.

Functions that don't depend on the themes config — `setScheme`, `toggleScheme`, `isDark`, `getScheme`, `getDefaultScheme`, `getSchemeSource`, and `getThemeSource` — are imported directly from `@plcharriere/svelte-themes`. Only the functions whose signatures narrow against your theme names live on the handle.

Each theme is a dynamic import. Vite emits one chunk per theme — only the active one is loaded on the server, only the one being switched to is fetched on the client.

**Alternative — untyped pattern.** If you don't care about theme-name narrowing, you can discard the return value and import the loosely-typed functions from the package root:

```ts
// src/themes.ts
import { createThemes } from '@plcharriere/svelte-themes';

createThemes({ themes: { /* ... */ } });
```

```ts
// anywhere
import { setTheme, getCurrentTheme } from '@plcharriere/svelte-themes';

setTheme('bubblegum');           // name: string — no autocomplete, no typo check
```

Same runtime behavior, same reactive state — you just lose `keyof T` narrowing on the theme-axis functions. The scheme functions (`setScheme`, `isDark`, etc.) are identical either way.

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
  import '../themes'; // ensures createThemes() runs on the client

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
  import { getThemes, getCurrentTheme, setTheme } from '../themes';
  import {
    isDark,
    getScheme,
    setScheme,
    toggleScheme,
    getThemeSource,
    getSchemeSource
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

## Theme axis vs scheme axis

The library treats **theme** (the named palette) and **scheme** (light/dark) as two orthogonal axes:

- **Theme** — a name like `'bubblegum'` or `'ocean'` resolving to a CSS file. Set with `setTheme`. Persisted in the `theme` cookie.
- **Scheme** — `'light' | 'dark' | 'system'`. Set with `setScheme` / `toggleScheme`. Persisted in the `scheme` cookie. Renders as the `dark` class on `<html>`.

Combine freely: `bubblegum` light, `bubblegum` dark, `ocean` light, `ocean` dark.

For each axis, three accessors give you current value, default, and source:

**Theme**

- **`getCurrentTheme()`** → `string` — the active theme name.
- **`getDefaultTheme()`** → `string` — the configured default. Useful for a "Reset to default" button without hardcoding the name.
- **`getThemeSource()`** → `'cookie' | 'default'` — `'cookie'` if the user explicitly picked a theme, `'default'` if no cookie is set and `defaultTheme` is being used. Imported from the package root.

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
  import {
    isLoadingTheme,
    getLoadingTheme,
    getThemes,
    setTheme
  } from '@plcharriere/svelte-themes';
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

## Scoped themes

Same library, opt-in. Reach for scopes when different sections of your site need **independent** theme choices that don't bleed into each other — typically a marketing/landing surface and an admin/dashboard surface.

The mental model: one registry of themes, multiple **scopes** that each pick a subset and a default. The scope active on the current route is resolved automatically from the URL — server-side from the request, client-side reactively from `page.url.pathname`.

Light/dark **scheme** is shared across all scopes by default (it's a user preference, not a section property). A scope can opt into an independent scheme for the rare case where one section must always be light or dark.

### When to reach for it

- `/` should show `sunset` / `ocean`, `/admin` should show `slate` / `graphite`, and switching theme on one must not touch the other.
- Persistence: a user picks `ocean` on landing, navigates through admin, comes back — landing is still `ocean`. Admin is still whatever they last picked there.
- One light/dark toggle for the whole app (default), or — explicitly — a section forced to its own scheme.

If your app has one theme system, **stay flat**. Scopes add concepts you don't need.

### Config

```ts
// src/themes.ts
import { createScopedThemes } from '@plcharriere/svelte-themes';

export const { landing, admin, getActiveScope } = createScopedThemes({
  themes: {
    sunset:   () => import('./themes/sunset.css?inline'),
    ocean:    () => import('./themes/ocean.css?inline'),
    slate:    () => import('./themes/slate.css?inline'),
    graphite: () => import('./themes/graphite.css?inline')
  },

  // shared scheme — one light/dark for the whole app
  defaultScheme: 'system',
  cookieScheme: 'scheme',

  scopes: {
    landing: {
      match: '/',                  // first scope is also the no-match fallback
      themes: ['sunset', 'ocean'], // optional — omit to inherit the full registry
      defaultTheme: 'sunset'
      // cookieTheme omitted → auto-derived 'landing-theme'
    },
    admin: {
      match: '/admin',
      themes: ['slate', 'graphite'],
      defaultTheme: 'slate'
    }
  }
});
```

### Return shape

The scope handles are flat top-level keys, alongside `getActiveScope`:

```ts
landing.setTheme('ocean');        // typed: 'sunset' | 'ocean'
admin.setTheme('graphite');       // typed: 'slate' | 'graphite'
landing.setTheme('graphite');     // TS error — not in landing's subset

getActiveScope();                 // 'landing' | 'admin' — reactive
```

Each scope key is a full themes handle (`setTheme`, `getThemes`, `getCurrentTheme`, `getDefaultTheme`, `isLoadingTheme`, `getLoadingTheme`) narrowed to that scope's theme subset. Use these when you statically know which scope you're in (e.g. a component that only ever renders under `/admin`).

`getActiveScope` is the only library-provided key in the return — `createScopedThemes` throws if a scope is named `getActiveScope`.

### Smart root functions

The functions exported from the package root — `setTheme`, `getThemes`, `getCurrentTheme`, `getDefaultTheme`, `isLoadingTheme`, `getLoadingTheme` — become **active-scope dispatchers** in a scoped app. They resolve the scope from the current route at call time and delegate:

```svelte
<!-- src/routes/+layout.svelte — works on every route, no scope hardcoded -->
<script>
  import { getThemes, getCurrentTheme, setTheme } from '@plcharriere/svelte-themes';
</script>

<select onchange={(e) => setTheme(e.currentTarget.value)} value={getCurrentTheme()}>
  {#each getThemes() as name}
    <option value={name}>{name}</option>
  {/each}
</select>
```

Under `/admin`, this picker offers `slate` / `graphite` and writes the admin cookie. Under `/`, it offers `sunset` / `ocean` and writes the landing cookie. **The same component**, no `if (route.startsWith('/admin'))` branching.

`getThemes()` returns the **active scope's** theme subset, not the global registry — so a generic picker only ever offers themes appropriate to the route.

Typing trade-off: root functions stay loosely typed (`name: string`) — the active scope isn't known at compile time. For narrow typing, use the destructured scope handle (`admin.setTheme(...)`).

Scheme functions (`setScheme`, `toggleScheme`, `isDark`, `getScheme`, `getDefaultScheme`, `getSchemeSource`, `getThemeSource`) are **global** under the default shared scheme — every call routes to the one shared scheme cookie, no scope dispatch needed. They become scope-aware for any scope with its own scheme (either declared per-scope, or under `sharedScheme: false`), so the call writes that scope's cookie and the change doesn't bleed to other scopes.

### The `match` field

`match` decides which scope a URL belongs to. Evaluated against the runtime `pathname` on every request (server) and every navigation (client).

```ts
type Matcher = string | readonly string[] | ((url: URL) => boolean);
```

| Form | Example | Behavior |
|---|---|---|
| String | `'/admin'` | Segment-aware prefix — matches `/admin`, `/admin/users/42`, **not** `/administrator`. |
| Array | `['/admin', '/dashboard']` | Any-of. Puts disjoint route trees in one scope. |
| Predicate | `(url) => url.pathname.split('/')[2] === 'admin'` | Full control. Use when a dynamic segment is part of the boundary (e.g. i18n prefixes `/en/admin`, `/fr/admin`). |

**Resolution:** longest matching prefix wins among string/array scopes. Predicates are evaluated in declaration order (first match wins). A URL matching nothing falls back to the **first declared scope** — put your primary one first.

`match` works on the resolved runtime path; it doesn't parse SvelteKit route IDs (`[id]`, `[...rest]`). Predicates cover anything prefixes can't.

### Shared vs per-scope scheme

By default, **scheme is shared** — `defaultScheme` and `cookieScheme` live at the top level, every scope uses them, and there is one global light/dark toggle. That's right ~95% of the time (dark mode is a user preference, not a section property).

**One scope independent** — declare its own `defaultScheme` or `cookieScheme`:

```ts
scopes: {
  landing: { match: '/', defaultTheme: 'sunset' },
  marketing: {
    match: '/marketing',
    defaultTheme: 'sunset',
    defaultScheme: 'light'   // marketing always renders light
  }
}
```

`cookieScheme` is auto-derived if you don't name it (next section).

**Every scope independent** — flip the baseline with `sharedScheme: false`:

```ts
createScopedThemes({
  themes: { /* ... */ },
  defaultScheme: 'system',
  sharedScheme: false,        // default: true
  scopes: {
    site:  { match: '/',      defaultTheme: 'bubblegum' },
    admin: { match: '/admin', defaultTheme: 'claude' }
  }
});
```

Each scope now has its own scheme cookie (`site-scheme`, `admin-scheme`) — toggling dark on `/admin` doesn't touch `/`. Per-scope overrides still win, and scopes inherit the top-level `defaultScheme` as their first-visit fallback.

### Cookie names — auto-derived

Per-scope cookie names default by derivation from the scope name. You only write them to override.

- `cookieTheme` omitted on a scope → `${scopeName}-theme`, e.g. scope `admin` → `admin-theme`.
- `cookieScheme` omitted on a scope **that has an independent scheme** (declared a scheme field, or under `sharedScheme: false`) → `${scopeName}-scheme`, e.g. `admin-scheme`.
- Otherwise (the default `sharedScheme: true`, no per-scope scheme field) the scope uses the shared top-level scheme cookie.

```ts
scopes: {
  admin: {
    match: '/admin',
    defaultTheme: 'slate',
    cookieTheme: 'panel-theme' // explicit override wins over 'admin-theme'
  }
}
```

The minimal scope config is `{ match, defaultTheme }` (plus `themes` if you want a subset) — cookie names are plumbing the lib fills in.

Isolation comes from **distinct cookie names**, not paths. All cookies use `path=/`; the server reads the matched scope's cookie name. So `setTheme('ocean')` on `/` writes `landing-theme`; `setTheme('graphite')` on `/admin` writes `admin-theme`; coming back to `/` reads `landing-theme` unchanged.

### No-flash cross-scope navigation

When the user SPA-navigates from one scope to another (e.g. `/admin` → `/`), the target scope's theme CSS swaps into the shared `<style id="svelte-themes">` atomically — the same flash-free guarantee as `setTheme`. The CSS is fetched, then `<style>` content and `data-theme` swap together. To make even the *first* cross-scope hop instant, the client speculatively preloads the other scopes' resolved themes on idle after boot — by the time the user navigates, the target CSS is already cached.

### Wiring SvelteKit

Identical to the [flat Quickstart](#3-wire-sveltekit) — same `hooks.server.ts`, same `app.html`, same `import '../themes'` in the root layout. `createThemesHandle()` reads the scope registry and matches each request to the right scope.

For per-scope narrow typing, import the destructured handle from your `themes.ts` in the scope-specific layout:

```svelte
<!-- src/routes/admin/+layout.svelte -->
<script>
  import { admin } from '../../themes';
  let { children } = $props();
</script>

<button onclick={() => admin.setTheme('graphite')}>Use graphite</button>
{@render children()}
```

For everywhere-else code (a header that lives under any route), use the root smart dispatchers — they auto-dispatch to whichever scope is active.

### Validation

`createScopedThemes` throws at call time on:

- An empty top-level `themes` record.
- An empty `scopes` object.
- A scope's `defaultTheme` not in its `themes` subset (or not in the global registry, if `themes` is omitted).
- A scope referencing a theme key never registered in top-level `themes`.
- Two scopes sharing a `cookieTheme` or `cookieScheme` name **after derivation** — overlapping names defeat per-scope isolation.
- Two scopes with identical `match` patterns — ambiguous, specificity can't break the tie.
- A scope named `getActiveScope` — collides with the reserved helper key.
- Invalid cookie names (must match `^[A-Za-z0-9_-]+$`).

## Two entry points, two bundles

```ts
import { createThemes } from '@plcharriere/svelte-themes';        // flat
import { createScopedThemes } from '@plcharriere/svelte-themes';  // scoped
```

They live in separate modules and never reference each other, so ES named-export tree-shaking does the right thing: a flat-only app that imports only `createThemes` drops the scoped machinery (~2–4KB) from the bundle automatically; a scoped app drops the flat helpers. Import only what you use.

## TypeScript

The library uses TS 5+ `const` type parameters internally, so you write plain object/array literals — no `as const`, no explicit annotations:

```ts
const { admin } = createScopedThemes({
  themes: { slate: ..., graphite: ... },
  scopes: {
    admin: {
      match: '/admin',
      themes: ['slate', 'graphite'], // captured as a literal tuple automatically
      defaultTheme: 'slate'
    }
  }
});

admin.setTheme('graphite'); // ✅
admin.setTheme('sunset');   // ❌ TS error — not in admin's subset
```

The exported types, for advanced use:

```ts
import type {
  Scheme,        // 'light' | 'dark' | 'system'
  Matcher,       // string | readonly string[] | ((url: URL) => boolean)
  ThemeLoader,   // () => Promise<string | { default: string }>
  ThemesConfig,  // flat config
  ThemesAPI,     // flat handle
  ScopeDecl,     // one scope's config
  ScopedConfig,  // scoped config
  ScopedAPI      // scoped return — per-scope handles + getActiveScope
} from '@plcharriere/svelte-themes';
```

## Server entry

```ts
import { createThemesHandle } from '@plcharriere/svelte-themes/server';

export const handle = createThemesHandle();
```

Parameterless. Works identically for flat and scoped apps — it reads the registry, matches `event.url.pathname` against the registered scopes (one implicit scope for flat, N scopes for scoped, falling back to the first scope if none match), resolves that scope's theme cookie and the scheme (shared or scope-independent), loads the theme CSS, fills the `%theme-css%` / `%theme%` / `%dark%` placeholders, and injects the boot script. The scopes in your config *are* the route mapping — no route arguments on the handle.

## Features

- **SSR-safe** — the active theme's CSS is inlined into the HTML on the server. No flash on reload.
- **Cookie-persisted** — the choice survives reloads and works across server and client without `localStorage` hacks.
- **Respects `prefers-color-scheme`** — when the user is in system mode (default, or `setScheme('system')`), the library reads the `Sec-CH-Prefers-Color-Scheme` client hint server-side, falls back to a tiny boot script, and listens for live OS changes while the page is open. Set `defaultScheme: 'light'` or `'dark'` to ignore the OS preference for first-time visitors; users can still opt into system at any point via `setScheme('system')`.
- **Cross-tab sync** — switching theme or scheme in one tab updates every other open tab live via `BroadcastChannel`. Scope-tagged so an admin-theme change can't leak into a landing tab. Toggleable.
- **Reactive reads** — `getCurrentTheme()`, `getThemeSource()`, `isDark()`, `getScheme()`, `getSchemeSource()`, `isLoadingTheme()`, `getLoadingTheme()`, and `getActiveScope()` are backed by Svelte 5 runes. Read them in a template, `$derived`, or `$effect` and your UI tracks the value automatically — cross-tab updates, OS preference changes, route changes, and in-flight theme loads all flow into your components with no manual subscription.
- **Lazy-loaded** — each theme is a dynamic import. The server only loads the active theme; the client only fetches a theme on first switch, then caches it.
- **Scoped (opt-in)** — per-section themes with automatic active-scope dispatch and flash-free cross-scope navigation.
- **Plain CSS** — themes are CSS files. Bring your own variables, your own Tailwind setup, your own conventions.
- **Independent scheme toggle** — `dark` is a class on `<html>`, orthogonal to the theme name. Combine freely.

## API reference

### Setup

| Export | Purpose |
| --- | --- |
| `createThemes(config)` | Register a flat themes system → flat handle. |
| `createScopedThemes(config)` | Register a scoped themes system → per-scope handles + `getActiveScope`. |
| `createThemesHandle()` | Server entry (`@plcharriere/svelte-themes/server`), works for both. |

### Theme (flat handle / per-scope handle)

| Export | Purpose |
| --- | --- |
| `setTheme(name, scheme?)` | Switch theme, optionally also set scheme. Async. |
| `getThemes()` | All theme names registered in this scope (or all themes, in flat mode). |
| `getCurrentTheme()` | Active theme name. |
| `getDefaultTheme()` | Configured default theme name. |
| `isLoadingTheme(name?)` | `true` while a theme chunk is in-flight. Pass a name to ask about a single theme. |
| `getLoadingTheme()` | Name of the theme currently loading, or `null`. |

### Theme (package root — smart dispatchers in scoped apps)

| Export | Purpose |
| --- | --- |
| `setTheme`, `getThemes`, `getCurrentTheme`, `getDefaultTheme`, `isLoadingTheme`, `getLoadingTheme` | Same shape as the handle functions, loosely typed (`name: string`). In a scoped app, dispatch to the active scope. In a flat app, identical to the handle. |
| `getThemeSource()` | `'cookie'` (user picked) / `'default'` (config fallback). Lives only on the root. |

### Scheme (package root)

| Export | Purpose |
| --- | --- |
| `setScheme(scheme)` | Set scheme. `scheme: 'light' \| 'dark' \| 'system'`. |
| `toggleScheme()` | Flip between `'light'` and `'dark'`. |
| `getScheme()` | The chosen value — `'light'` / `'dark'` / `'system'`. |
| `getDefaultScheme()` | Configured default scheme. |
| `getSchemeSource()` | `'cookie'` (user picked) / `'default'` (config fallback). |
| `isDark()` | Resolved dark state — always boolean. |

Under the default shared scheme, all six route to one global scheme cookie. For independent-scheme scopes (declared per-scope, or under `sharedScheme: false`), they dispatch to the active route's scope so the change only affects that scope.

### Scoped-only

| Export | Purpose |
| --- | --- |
| `getActiveScope()` | Name of the scope active on the current route. Reactive. |

## Config options — flat

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

## Config options — scoped

```ts
createScopedThemes({
  themes: {
    name: () => import('./path-to-theme.css?inline')
  },
  defaultScheme: 'system',      // optional — shared scheme default
  cookieScheme: 'scheme',       // optional — shared scheme cookie name
  sharedScheme: true,           // optional — false = every scope independent
  syncTabs: true,               // optional
  syncChannel: 'svelte-themes', // optional
  scopes: {
    scopeName: {
      match: '/path',           // string | string[] | (url: URL) => boolean
      themes: ['a', 'b'],       // optional — defaults to all registered themes
      defaultTheme: 'a',        // required — must be in this scope's themes
      cookieTheme: 'a-theme',   // optional — defaults to '${scopeName}-theme'
      defaultScheme: 'light',   // optional — declaring opts into an independent scheme
      cookieScheme: 'a-scheme'  // optional — defaults to '${scopeName}-scheme' if independent
    }
  }
});
```

## How it works

For each request the handle picks a scope (the implicit single scope, in flat mode), then decides theme + scheme by reading that scope's cookies:

1. **Active scope** — match `event.url.pathname` against the registered scopes; longest matching string-prefix wins, otherwise first declared scope.
2. **Theme cookie** — if set and known, use it. Otherwise fall back to the scope's `defaultTheme`.
3. **Scheme cookie** — has three valid values:
   - `'dark'` → force dark
   - `'light'` → force light
   - `'system'` → follow OS prefs (read `Sec-CH-Prefers-Color-Scheme` request header)
4. **No scheme cookie** — fall back to `defaultScheme`:
   - `'system'` → follow OS prefs (same as cookie `'system'`)
   - `'light'` / `'dark'` → use that

The handle loads the matching theme CSS lazily, inlines it into `%theme-css%`, sets `%theme%` / `%dark%` on `<html>`, and emits `Accept-CH: Sec-CH-Prefers-Color-Scheme` so the next request carries the hint. By the time the HTML reaches the browser, the right theme is already painted.

A tiny boot script is auto-injected by the handle right before `</head>`. It runs synchronously before paint, and toggles the `dark` class from `matchMedia('(prefers-color-scheme: dark)')` when the user is in system mode (cookie `'system'` or no cookie + `defaultScheme: 'system'`) — covers first-ever visits and browsers that don't send the client hint. The configured `cookieScheme` name is baked into the script per request. A `matchMedia` listener on the client keeps the class updated if the OS preference changes mid-session.

On the client, `setTheme(name)` writes the scope's theme cookie. `setScheme('light' | 'dark' | 'system')` writes the scheme cookie (shared or scope-independent). All persist across reloads — the server reads the cookie next request and renders the matching state.

When `syncTabs` is enabled (the default), each `setTheme` / `setScheme` / `toggleScheme` also posts a message on a `BroadcastChannel`. Other tabs of the same origin receive the message, validate it, and apply the change locally — without re-broadcasting or re-writing cookies, so there's no echo. Theme messages are tagged with the scope name so a change in `admin` doesn't leak into a `landing` tab. `BroadcastChannel` is already same-origin scoped, so messages can't cross between sites.

## License

MIT
