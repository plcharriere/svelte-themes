# svelte-themes

SSR-safe, cookie-persisted theme switching for **SvelteKit 2 + Svelte 5**. Themes are plain CSS files, lazy-loaded on demand. Compose **multiple orthogonal axes** (palette × radius × density, all active at once), with light/dark as an independent toggle that respects `prefers-color-scheme` until the user explicitly chooses. Optional **scoped themes** let `/` and `/admin` carry their own theme choices side-by-side. Cross-tab sync, no flash on reload.

```ts
setTheme('bubblegum');           // switch theme, persist via cookie
setScheme('dark');               // scheme is independent of theme
setScheme('system');             // follow OS prefers-color-scheme
toggleScheme();                  // flip between 'light' and 'dark'
setTheme('candyland', 'dark');   // switch theme + scheme in one call
```

No flash on reload. The active theme's CSS is read from a cookie server-side and inlined into the HTML before the page ships.

> **Upgrading from 0.2.x?** `app.html` changed (breaking) and scoped config is now self-contained per scope. See [Migrating from 0.2.x](#migrating-from-02x).

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

The 95% path: one set of themes for the whole app, one theme active at a time. Reach for [multi-axis themes](#multi-axis-themes) when you want several dimensions composing at once, or [scoped themes](#scoped-themes) when different sections of your site need independent choices.

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

Each theme file is self-contained — bring your own Tailwind import, `@theme inline {}` mapping, base layer, whatever. The library only swaps the file's content into a `<style>` element.

### 2. Register your themes

```ts
// src/themes.ts
import { createThemes } from '@plcharriere/svelte-themes';

export const {
  setTheme,
  getThemes,
  getCurrentTheme,
  getDefaultTheme,
  getThemeSource,
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

`createThemes` is generic over the themes record, so the returned `setTheme(name)`, `getCurrentTheme()`, etc. are typed against your specific theme names — `setTheme('blubgegum')` is a TS error, autocomplete works, switch statements narrow correctly.

The scheme functions — `setScheme`, `toggleScheme`, `isDark`, `getScheme`, `getDefaultScheme`, `getSchemeSource` — don't narrow against your theme names, so they're imported directly from `@plcharriere/svelte-themes` (see [Switch themes](#4-switch-themes)). Everything else lives on the handle.

Each theme is a dynamic import. Vite emits one chunk per theme — only the active one is loaded on the server, only the one being switched to is fetched on the client.

**Alternative — untyped pattern.** If you don't care about theme-name narrowing, you can discard the return value and import the loosely-typed theme functions from the package root:

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

Same runtime behavior, same reactive state — you just lose `keyof T` narrowing on the theme functions.

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
<html lang="en" class="%dark%">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    %sveltekit.head%
  </head>
  <body data-sveltekit-preload-data="hover">
    <div style="display: contents">%sveltekit.body%</div>
  </body>
</html>
```

`app.html` carries exactly **one** placeholder: `%dark%` (`dark` or empty) on `<html>`. Everything else is injected by the handle on every request — it inserts the active theme's `<style>` element(s) and a tiny boot script before `</head>`. The boot script fixes up the `dark` class from `prefers-color-scheme` whenever the user is in system mode (cookie `scheme=system`, or no cookie + `defaultScheme: 'system'`) — it runs before paint, so no flash.

> There is no `data-theme` attribute and no `<style id="svelte-themes">%theme-css%</style>` line anymore — the handle injects the theme `<style>` directly. If you're upgrading, delete both. See [Migrating from 0.2.x](#migrating-from-02x).

### 4. Switch themes

```svelte
<script>
  import { getThemes, getCurrentTheme, setTheme } from '../themes';
  import { isDark, getScheme, setScheme, toggleScheme } from '@plcharriere/svelte-themes';
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

`setTheme` and `setScheme` write the configured cookies (defaults `theme` and `scheme`) so the choice survives reloads. `setScheme('system')` writes `scheme=system` and applies `prefers-color-scheme`. The active theme's CSS swaps in instantly via the `<style>` element the server already rendered. The `getCurrentTheme()` / `isDark()` / `getScheme()` reads above are reactive — when another tab broadcasts a change, the select's `value` and the dark/light label flip without any extra wiring.

### Theme axis vs scheme axis

The library treats **theme** (the named palette) and **scheme** (light/dark) as two orthogonal axes. Scheme is **not** one of the multi-axis themes below — it has its own light/dark semantics and never touches a theme `<style>`.

- **Theme** — a name like `'bubblegum'` or `'ocean'` resolving to a CSS file. Set with `setTheme`. Persisted in the `theme` cookie.
- **Scheme** — `'light' | 'dark' | 'system'`. Set with `setScheme` / `toggleScheme`. Persisted in the `scheme` cookie. Renders as the `dark` class on `<html>`.

Combine freely: `bubblegum` light, `bubblegum` dark, `ocean` light, `ocean` dark.

For each axis, accessors give you the current value, default, and source:

**Theme**

- **`getCurrentTheme()`** → `string` — the active theme name.
- **`getDefaultTheme()`** → `string` — the configured default. Useful for a "Reset to default" button without hardcoding the name.
- **`getThemeSource()`** → `'cookie' | 'default'` — `'cookie'` if the user explicitly picked a theme, `'default'` if no cookie is set and `defaultTheme` is being used.

**Scheme**

- **`isDark()`** → `boolean` — the **resolved** dark state. Always a boolean, regardless of how it was decided. Use for visual logic ("show the moon icon").
- **`getScheme()`** → `'light' | 'dark' | 'system'` — the **value** the user (or config) chose. Returns `'system'` when following the OS, `'light'`/`'dark'` when explicitly picked. Use for binding a 3-way control.
- **`getDefaultScheme()`** → `'light' | 'dark' | 'system'` — the configured default.
- **`getSchemeSource()`** → `'cookie' | 'default'` — `'cookie'` if the user explicitly chose anything (including `'system'`), `'default'` if the config fallback is being used.

```svelte
<button onclick={() => { setTheme(getDefaultTheme()); setScheme(getDefaultScheme()); }}>
  Reset to defaults
</button>
```

### Loading state

Theme chunks are dynamic imports — the **first** switch to a theme fetches its CSS chunk over the network. While that's in flight you can show a loading indicator:

```svelte
<script>
  import { isLoadingTheme, getLoadingTheme, getThemes, setTheme } from '../themes';
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

<!-- or read the loading name as a string (flat mode) -->
{#if getLoadingTheme()}
  <p>Loading {getLoadingTheme()}…</p>
{/if}
```

Both functions also fire when **another tab** broadcasts a theme change and this tab needs to fetch the chunk to keep up. After cache, switching is instant and these stay false.

## Multi-axis themes

Sometimes one theme name isn't enough — you want a **palette** and a **corner radius** and a **density**, each chosen independently, all composing into the page at once. That's a multi-axis (axed) themes config: several orthogonal axes, each contributing its own `<style>` layer, switchable on their own.

### Flat → axed

A **flat** `themes` is a flat record of loaders (the quickstart). An **axed** `themes` is a record of **axes**, each an inner record of loaders:

```ts
createThemes({
  themes: {
    palette: {
      salmon:   () => import('./themes/salmon.css?inline'),
      sapphire: () => import('./themes/sapphire.css?inline')
    },
    radius: {
      sharp: () => import('./themes/radius-sharp.css?inline'),
      round: () => import('./themes/radius-round.css?inline')
    }
  },
  defaultThemes: { palette: 'salmon', radius: 'sharp' }
});
```

The shape is detected automatically: **any record value flips the config to axed**. Flat uses `defaultTheme` (a single name); axed uses `defaultThemes` (per-axis, and **may be partial** — an omitted axis falls back to its first declared theme). The two are mutually exclusive.

### Switching and composition

Theme names are **unique across a config's axes**, so `setTheme` needs only the name — it finds the axis that owns it and switches that axis, leaving the others untouched:

```ts
setTheme('salmon');   // finds 'salmon' in the palette axis, switches it
setTheme('round');    // switches the radius axis → salmon + round now compose
```

`setTheme(name, scheme?)` still takes the optional scheme arg, behaving exactly like `setScheme` (see [Scheme](#scheme)).

### Mixed: bare loaders fold into a `default` axis

You can mix bare loaders and named axes. Bare loaders fold into an implicit axis named `default`:

```ts
themes: {
  bubblegum: () => import('./themes/bubblegum.css?inline'),  // ┐ → default axis
  candyland: () => import('./themes/candyland.css?inline'),  // ┘
  radius: {
    sharp: () => import('./themes/radius-sharp.css?inline'),
    round: () => import('./themes/radius-round.css?inline')
  }
}
// → default axis = { bubblegum, candyland },  radius axis = { sharp, round }
```

If you also declare a named `default` axis, the bare loaders **merge into it** (no conflict):

```ts
themes: {
  bubblegum: () => import('./b.css?inline'),               // bare
  default: { candyland: () => import('./c.css?inline') },  // explicit `default` axis
  palette: { salmon: () => import('./s.css?inline') }
}
// → default axis = { bubblegum, candyland },  palette axis = { salmon }
```

On a **same-name collision** between a bare loader and an explicit `default` entry, the **explicit entry wins** (it's an override, not an error). This merge happens before the duplicate-name check runs.

### Per-axis return shapes

In an axed config, the getters return **per-axis objects** keyed by axis name instead of bare strings:

```ts
getCurrentTheme();   // { palette: 'salmon', radius: 'sharp' }
getThemes();         // { palette: ['salmon','sapphire'], radius: ['sharp','round'] }
getDefaultTheme();   // { palette: 'salmon', radius: 'sharp' }
getThemeSource();    // { palette: 'cookie', radius: 'default' }

isLoadingTheme();        // true if ANY axis is loading
isLoadingTheme('round'); // true if 'round' (i.e. its radius axis) is loading
getLoadingTheme();       // { radius: 'round' } — only axes mid-load; {} when idle
```

`getLoadingTheme()` in an axed config returns an object containing **only the axes currently loading**, mapping axis → the in-flight theme name (its keys *are* the loading axes; nothing loading → `{}`). In a flat config it stays `string | null`, as in the quickstart.

### Per-axis cookies and `<style>` elements

Each axis persists to its own cookie — `theme-${axis}` — and renders into its own `<style id="svelte-themes-${axis}">`. A flat config keeps the unsuffixed `theme` cookie and a single `<style id="svelte-themes">`. Axes are layered in **declaration order** (last axis wins on variable conflicts), so order them so the more specific axis comes last. Full table in [Cookies](#cookies).

### Worked example — the demo's `palette` × `radius`

The demo composes a `palette` axis (43 colour themes) with a `radius` axis (corner roundness):

```ts
// src/themes.ts
import { createThemes } from '@plcharriere/svelte-themes';

export const {
  setTheme, getThemes, getCurrentTheme, getDefaultTheme,
  getThemeSource, isLoadingTheme, getLoadingTheme
} = createThemes({
  defaultThemes: { palette: 'default', radius: 'soft' },
  themes: {
    palette: {
      default:   () => import('./themes/default.css?inline'),
      bubblegum: () => import('./themes/bubblegum.css?inline'),
      catppuccin: () => import('./themes/catppuccin.css?inline'),
      // ...40 more
    },
    radius: {
      sharp: () => import('./themes/radius-sharp.css?inline'),
      soft:  () => import('./themes/radius-soft.css?inline'),
      round: () => import('./themes/radius-round.css?inline')
    }
  }
});
```

A picker per axis just iterates `getThemes()` per key:

```svelte
<script>
  import { getThemes, getCurrentTheme, setTheme } from '../themes';
</script>

{#each Object.entries(getThemes()) as [axis, names]}
  <select onchange={(e) => setTheme(e.currentTarget.value)} value={getCurrentTheme()[axis]}>
    {#each names as name}
      <option value={name}>{name}</option>
    {/each}
  </select>
{/each}
```

## Scoped themes

Same library, opt-in. Reach for scopes when different **sections** of your site need independent theme choices that don't bleed into each other — typically a marketing/landing surface and an admin/dashboard surface. Exactly one scope is active at a time; the URL picks it.

Each scope is **self-contained** — it declares its **own** `themes` (flat, axed, or mixed) and its own default. There is no shared top-level theme registry; nothing is inherited between scopes.

If your app has one theme system, **stay flat** (or axed). Scopes add concepts you don't need.

### Config

```ts
// src/themes.ts
import { createScopedThemes } from '@plcharriere/svelte-themes';

export const { landing, admin, getActiveScope } = createScopedThemes({
  // scheme stays top-level — shared across scopes by default
  defaultScheme: 'system',

  scopes: {
    landing: {
      match: '/',                 // first scope is also the no-match fallback
      themes: {
        sunset: () => import('./themes/sunset.css?inline'),
        ocean:  () => import('./themes/ocean.css?inline')
      },
      defaultTheme: 'sunset'
    },
    admin: {
      match: '/admin',
      // a scope's themes can themselves be axed
      themes: {
        density: {
          compact: () => import('./admin/compact.css?inline'),
          comfy:   () => import('./admin/comfy.css?inline')
        },
        accent: {
          blue:  () => import('./admin/blue.css?inline'),
          green: () => import('./admin/green.css?inline')
        }
      },
      defaultThemes: { density: 'compact', accent: 'blue' }
    }
  }
});
```

A **flat scope** uses `defaultTheme`; an **axed scope** uses `defaultThemes` (per-axis, may be partial). A scope omitting its default falls back to each axis's first declared theme.

**Theme names are scope-local.** `sunset` may exist in two scopes independently — `admin.setTheme(name)` only searches admin's themes, so there's no global collision. Names must be unique *within* a scope (so `setTheme` dispatch is unambiguous). Sharing a loader across scopes is your call — hoist it to a `const` and reference it in each scope.

### Return shape

The scope handles are flat top-level keys, alongside `getActiveScope`. Each handle's return shape follows **that scope's** themes shape — a flat scope returns strings, an axed scope returns per-axis objects (exactly like [`createThemes`](#per-axis-return-shapes)):

```ts
landing.setTheme('ocean');       // flat scope, typed: 'sunset' | 'ocean'
landing.getCurrentTheme();       // 'ocean'  (string)

admin.setTheme('compact');       // axed scope, typed: 'compact'|'comfy'|'blue'|'green'
admin.getCurrentTheme();         // { density: 'compact', accent: 'blue' }
admin.getThemes();               // { density: ['compact','comfy'], accent: ['blue','green'] }
admin.getThemeSource();          // { density: 'cookie', accent: 'default' }
admin.getLoadingTheme();         // { density: 'comfy' } — only axes mid-load; {} idle

getActiveScope();                // 'landing' | 'admin' — tracks the route
```

Each scope key carries only the **theme** functions (`setTheme`, `getThemes`, `getCurrentTheme`, `getDefaultTheme`, `getThemeSource`, `isLoadingTheme`, `getLoadingTheme`), narrowly typed. Use them when you statically know which scope you're in (e.g. a component that only renders under `/admin`). `getActiveScope` is the only library-provided key in the return — `createScopedThemes` throws if a scope is named `getActiveScope`.

### Smart root dispatchers

The **theme** functions exported from the package root — `setTheme`, `getThemes`, `getCurrentTheme`, `getDefaultTheme`, `getThemeSource`, `isLoadingTheme`, `getLoadingTheme` — become **active-scope dispatchers** in a scoped app. They resolve the scope from the current route at call time and delegate:

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

Under `/`, this picker offers the landing scope's themes and writes the landing cookie; under `/admin`, it offers admin's and writes admin's. **The same component**, no `if (route.startsWith('/admin'))` branching. `getThemes()` returns the **active scope's** themes (and in the active scope's shape — strings for flat, per-axis objects for axed).

Typing trade-off: root dispatchers stay loosely typed (the active scope isn't known at compile time). For narrow typing, use the destructured scope handle (`admin.setTheme(...)`).

**Scheme functions are root-only** (`setScheme`, `toggleScheme`, `isDark`, `getScheme`, `getDefaultScheme`, `getSchemeSource`) — there's no `scope.setScheme`. They act on the **active scope's** scheme when `sharedScheme: false`, or the **one global** scheme when shared (the default).

### The `match` field

`match` decides which scope a URL belongs to. Evaluated against the runtime `pathname` on every request (server) and every navigation (client). Unchanged from 0.2.x.

```ts
type Matcher = string | readonly string[] | ((url: URL) => boolean);
```

| Form | Example | Behavior |
|---|---|---|
| String | `'/admin'` | Segment-aware prefix — matches `/admin`, `/admin/users/42`, **not** `/administrator`. |
| Array | `['/admin', '/dashboard']` | Any-of. Puts disjoint route trees in one scope. |
| Predicate | `(url) => url.pathname.split('/')[2] === 'admin'` | Full control. Use when a dynamic segment is part of the boundary (e.g. i18n prefixes `/en/admin`). |

**Resolution:** longest matching prefix wins among string/array scopes. Predicates are evaluated in declaration order (first match wins). A URL matching nothing falls back to the **first declared scope** — put your primary one first. `match` works on the resolved runtime path; it doesn't parse SvelteKit route IDs (`[id]`, `[...rest]`).

### Shared vs per-scope scheme

`sharedScheme` (default `true`) is the master switch:

- **`true`** — all scopes share one scheme cookie (`scheme`), the top-level `defaultScheme` applies everywhere, and **per-scope `defaultScheme` is ignored**. That's right ~95% of the time (dark mode is a user preference, not a section property).
- **`false`** — each scope gets its own scheme cookie (`scheme-${scope}`) and its own `defaultScheme` (falling back to the top-level one). Toggling dark on `/admin` doesn't touch `/`.

```ts
createScopedThemes({
  defaultScheme: 'system',
  sharedScheme: false,          // every scope independent; default is true
  scopes: {
    landing: { match: '/',      themes: { /* ... */ }, defaultTheme: 'sunset' },
    admin:   { match: '/admin', themes: { /* ... */ }, defaultTheme: 'slate',
               defaultScheme: 'light' }   // admin first-visit defaults to light
  }
});
```

### Cookie names

Cookie names are derived automatically — see the full [Cookies](#cookies) table. In short: a scope's theme cookie is `theme-${scope}` (flat) or `theme-${scope}-${axis}` (axed); under `sharedScheme: false`, its scheme cookie is `scheme-${scope}`. Isolation comes from these **distinct names**, not paths — all cookies use `path=/`, and the server reads the matched scope's cookies. So `setTheme('ocean')` on `/` writes `theme-landing`; coming back later reads it unchanged.

### No-flash cross-scope navigation

When the user SPA-navigates from one scope to another (`/admin` → `/`), the target scope's axis CSS is fetched first, then the `<style>` element(s) and the `dark` class are swapped **atomically** — the same flash-free guarantee as `setTheme`. Axes present in both scopes reuse their element (content swap); axes only in the old scope are removed; axes only in the new scope are created. Under `sharedScheme: false` the scheme is re-resolved and re-applied too.

There is **no idle preload** — the library does not speculatively fetch other scopes' CSS, since a user may never visit them. Each scope's CSS loads only when it's actually navigated to; the first cross-scope hop pays its own one-time load, then caches.

### Wiring SvelteKit

Identical to the [flat Quickstart](#3-wire-sveltekit) — same `hooks.server.ts`, same minimal `app.html`, same `import '../themes'` in the root layout. `createThemesHandle()` reads the scope registry and matches each request to the right scope.

For per-scope narrow typing, import the destructured handle in a scope-specific layout:

```svelte
<!-- src/routes/admin/+layout.svelte -->
<script>
  import { admin } from '../../themes';
  let { children } = $props();
</script>

<button onclick={() => admin.setTheme('comfy')}>Comfy density</button>
{@render children()}
```

For everywhere-else code (a header under any route), use the root dispatchers — they auto-route to whichever scope is active.

### Validation

`createScopedThemes` throws at call time on:

- An empty `scopes` object, or a scope with an empty `themes`, or an axis with no themes inside it.
- A scope's `defaultTheme` (flat) referencing a theme not in that scope, or `defaultThemes` (axed) referencing an unknown axis key or a theme not in that axis.
- Duplicate theme names **across a scope's axes** (checked after the bare→`default` merge) — names may repeat *across* scopes, just not within one.
- Two scopes with identical `match` patterns.
- Any two derived cookie names colliding across the whole config (hyphenated scope/axis names can alias).
- Axis or scope names not matching `^[A-Za-z0-9_-]+$` (they become cookie names; `default` is valid).
- A scope named `getActiveScope` — reserved key.
- `cookieTheme === cookieScheme` — the two cookie families would alias.

## Scheme

Light/dark/system is an independent axis — **not** one of the multi-axis themes. It keeps its own semantics, fully unchanged across releases: `prefers-color-scheme`, a `system` mode, the `dark` class on `<html>`, the `Sec-CH-Prefers-Color-Scheme` client hint, the boot script, and no-flash SSR. Axes never touch the `dark` class.

`defaultScheme` decides what first-time visitors (no cookie) see:

- `'system'` (default) — follow `prefers-color-scheme`. The server reads the `Sec-CH-Prefers-Color-Scheme` client hint; the boot script and a `matchMedia` listener cover browsers that don't send it.
- `'light'` / `'dark'` — force light or dark for first-time visitors, ignoring the OS preference.

`setScheme('system')` is **always allowed**, regardless of `defaultScheme` — the choice is persisted as `scheme=system` and survives reloads. `setTheme(name, scheme?)` takes an optional second arg that behaves exactly like `setScheme` (it acts on the active/global scheme, independent of which scope's handle you called `setTheme` on).

In a scoped app, scheme is governed by `sharedScheme` (see [Shared vs per-scope scheme](#shared-vs-per-scope-scheme)).

## Cookies

Every cookie **leads with its type token** — `theme` for theme cookies, `scheme` for scheme cookies — then scope, then axis. So all theme cookies sort together, all scheme cookies sort together.

**Theme** — four-way, driven by (scoped?) × (axed?):

| | flat themes | axed themes |
|---|---|---|
| `createThemes` (no scope) | `theme` | `theme-${axis}` (bare loaders → `theme-default`) |
| `createScopedThemes` | `theme-${scope}` | `theme-${scope}-${axis}` (bare → `theme-${scope}-default`) |

**Scheme** — controlled by `sharedScheme`:

| | cookie |
|---|---|
| `createThemes`, or `sharedScheme: true` (default) | `scheme` |
| `createScopedThemes` + `sharedScheme: false` | `scheme-${scope}` |

All cookies use `path=/`. Derived names are validated against `^[A-Za-z0-9_-]+$`.

**Overriding the leading token.** `cookieTheme` (default `theme`) and `cookieScheme` (default `scheme`) replace the leading word in **every** derived cookie — useful to avoid collisions with other libraries or tenants on the same domain. They are **top-level only** (one prefix for the whole app, never per-scope):

```ts
createScopedThemes({
  cookieTheme: 'app-theme',     // → app-theme-landing, app-theme-admin-density, …
  cookieScheme: 'app-scheme',   // → app-scheme (or app-scheme-${scope} when independent)
  scopes: { /* ... */ }
});
```

`cookieTheme` and `cookieScheme` must differ — the library throws if they're equal, since the two cookie families would alias.

## TypeScript

The library uses TS 5+ `const` type parameters, so you write plain object literals — **no `as const`**, no explicit annotations:

```ts
const { admin } = createScopedThemes({
  scopes: {
    admin: {
      match: '/admin',
      themes: { slate: () => import('./slate.css?inline'),
                graphite: () => import('./graphite.css?inline') },
      defaultTheme: 'slate'
    }
  }
});

admin.setTheme('graphite'); // ✅
admin.setTheme('sunset');   // ❌ TS error — not in admin's themes
```

`createThemes` defaults are **fully typed** — `defaultTheme` / `defaultThemes` are checked against your `themes` (an unknown name or axis is a compile error). Per-scope defaults in `createScopedThemes` are **permissive** (typed as `string` / `Record<string, string>`) and **validated at runtime** instead — a deliberate trade-off so that whole-config scope inference still works; the per-scope **handle** narrowing (which reads `themes`) is fully preserved.

Exported types:

```ts
import type {
  Scheme,        // 'light' | 'dark' | 'system'
  Matcher,       // string | readonly string[] | ((url: URL) => boolean)
  ThemeLoader,   // () => Promise<string | { default: string }>
  ThemesConfig,  // createThemes config (flat | axed | mixed)
  ThemesAPI,     // one themes handle (flat-shaped or axed-shaped)
  ScopeDecl,     // one scope's config
  ScopedConfig,  // createScopedThemes config
  ScopedAPI      // scoped return — per-scope handles + getActiveScope
} from '@plcharriere/svelte-themes';
```

## API reference

### Setup

| Export | Purpose |
| --- | --- |
| `createThemes(config)` | Register a one-scope themes system (flat, axed, or mixed) → a `ThemesAPI` handle. |
| `createScopedThemes(config)` | Register N self-contained scopes → per-scope handles + `getActiveScope`. |
| `createThemesHandle()` | Server entry (`@plcharriere/svelte-themes/server`), parameterless, works for all shapes. |

### Theme (handle / per-scope handle)

Return shapes follow the themes shape: **flat** returns strings, **axed** returns per-axis objects.

| Export | Flat return | Axed return |
| --- | --- | --- |
| `setTheme(name, scheme?)` | switch theme (+ optional scheme), async | finds the owning axis, switches it |
| `getThemes()` | `string[]` | `Record<axis, string[]>` |
| `getCurrentTheme()` | `string` | `Record<axis, string>` |
| `getDefaultTheme()` | `string` | `Record<axis, string>` |
| `getThemeSource()` | `'cookie' \| 'default'` | `Record<axis, 'cookie' \| 'default'>` |
| `isLoadingTheme(name?)` | `boolean` | `boolean` (no arg → any axis; name → that theme's axis) |
| `getLoadingTheme()` | `string \| null` | `Partial<Record<axis, string>>` (only axes mid-load; `{}` idle) |

### Theme (package root — smart dispatchers in scoped apps)

| Export | Purpose |
| --- | --- |
| `setTheme`, `getThemes`, `getCurrentTheme`, `getDefaultTheme`, `getThemeSource`, `isLoadingTheme`, `getLoadingTheme` | Same functions as the handle, loosely typed. In a scoped app, dispatch to the active scope; in a one-scope app, identical to the handle. |

### Scheme (package root, root-only)

| Export | Purpose |
| --- | --- |
| `setScheme(scheme)` | Set scheme. `'light' \| 'dark' \| 'system'`. |
| `toggleScheme()` | Flip between `'light'` and `'dark'`. |
| `getScheme()` | The chosen value — `'light'` / `'dark'` / `'system'`. |
| `getDefaultScheme()` | Configured default scheme. |
| `getSchemeSource()` | `'cookie'` (user picked) / `'default'` (config fallback). |
| `isDark()` | Resolved dark state — always boolean. |

In a scoped app these act on the active scope's scheme (`sharedScheme: false`) or the one global scheme (shared).

### Scoped-only

| Export | Purpose |
| --- | --- |
| `getActiveScope()` | Name of the scope active on the current route. Tracks the route. |

## Config reference

### `createThemes`

```ts
createThemes({
  themes: { /* flat | axed | mixed */ },
  defaultTheme: 'name',                       // flat only — single name (default: first theme)
  defaultThemes: { axis: 'name' },            // axed only — per-axis, may be partial
  defaultScheme: 'system',                    // 'system' | 'light' | 'dark' (default 'system')
  cookieTheme: 'theme',                       // optional — leading token for theme cookies
  cookieScheme: 'scheme',                     // optional — leading token for scheme cookies
  syncTabs: true,                             // optional — broadcast changes to other tabs
  syncChannel: 'svelte-themes'                // optional — BroadcastChannel name
});
```

`defaultTheme` (flat) and `defaultThemes` (axed) are mutually exclusive — the one you can use is decided by your `themes` shape. There's only one scope, so no `sharedScheme`.

### `createScopedThemes`

```ts
createScopedThemes({
  scopes: {
    scopeName: {
      match: '/path',                         // string | string[] | (url: URL) => boolean
      themes: { /* flat | axed | mixed — this scope's own loaders */ },
      defaultTheme: 'name',                   // flat scope
      defaultThemes: { axis: 'name' },        // axed scope, may be partial
      defaultScheme: 'light'                  // used only when sharedScheme: false
    }
  },
  defaultScheme: 'system',                    // shared scheme default (default 'system')
  sharedScheme: true,                         // optional — false = every scope independent
  cookieTheme: 'theme',                       // optional — top-level only, prefixes ALL theme cookies
  cookieScheme: 'scheme',                     // optional — top-level only, prefixes ALL scheme cookies
  syncTabs: true,                             // optional
  syncChannel: 'svelte-themes'                // optional
});
```

`syncTabs` enables live cross-tab updates via `BroadcastChannel` — when one tab changes theme or scheme, every other open tab applies it immediately (messages are scope- and axis-tagged, so an admin change can't leak into a landing tab). `syncChannel` only matters if multiple apps share an origin and you want them isolated.

## Server entry

```ts
import { createThemesHandle } from '@plcharriere/svelte-themes/server';

export const handle = createThemesHandle();
```

Parameterless. Works identically for one-scope and scoped apps — it reads the registry, matches `event.url.pathname` against the registered scopes (one implicit scope for `createThemes`, N scopes for `createScopedThemes`, falling back to the first scope if none match), resolves each of the active scope's axis cookies and the scheme (shared or per-scope), loads the matching CSS, injects one `<style>` per axis plus the boot script before `</head>`, sets `%dark%` on `<html>`, and emits `Accept-CH: Sec-CH-Prefers-Color-Scheme`. The scopes in your config *are* the route mapping — no route arguments on the handle.

## How it works

For each request the handle picks the active scope, then resolves theme + scheme from that scope's cookies:

1. **Active scope** — match `event.url.pathname`; longest matching string-prefix wins, otherwise the first declared scope.
2. **Theme** — for each of the active scope's axes, read its cookie (`theme` / `theme-${axis}` / `theme-${scope}` / `theme-${scope}-${axis}`); if set and known, use it, else fall back to that axis's default. Load the CSS chunk and inject one `<style>` per axis (`svelte-themes` flat, `svelte-themes-${axis}` axed) before `</head>`.
3. **Scheme** — read the scheme cookie (`scheme` shared, or `scheme-${scope}` per-scope): `'dark'` / `'light'` force it; `'system'` follows OS prefs (via the `Sec-CH-Prefers-Color-Scheme` header). No cookie → fall back to `defaultScheme`. Render as the `dark` class via `%dark%` + the boot script.

The resolved per-axis state is stashed in an `AsyncLocalStorage` `RequestState` so the server-side getters return the same shape as the client. By the time the HTML reaches the browser, the right theme and scheme are already painted.

A tiny **boot script** is auto-injected right before `</head>`. It runs synchronously before paint and toggles the `dark` class from `matchMedia('(prefers-color-scheme: dark)')` when the user is in system mode — covering first-ever visits and browsers that don't send the client hint. A `matchMedia` listener keeps the class updated if the OS preference changes mid-session.

On the client, `setTheme(name)` writes the owning axis's cookie; `setScheme(...)` writes the scheme cookie. With `syncTabs` on (the default), each change also posts a scope- and axis-tagged message on a `BroadcastChannel`; other tabs validate and apply it locally without re-broadcasting, so there's no echo.

## Migrating from 0.2.x

- **`app.html` — remove two things (breaking).** Delete `data-theme="%theme%"` from `<html>` and delete the `<style id="svelte-themes">%theme-css%</style>` line. The handle now injects the theme `<style>` element(s) directly. Only `%dark%` remains on `<html>`:
  ```html
  <html lang="en" class="%dark%">
  ```
- **`data-theme` is gone.** The page is themed entirely by the CSS variables inside the injected `<style>` element(s); client state comes from cookies. If you relied on `[data-theme="…"]` selectors, that hook no longer exists — key off the CSS variables instead.
- **Cookie names renamed (breaking).** Scoped cookies moved the type token to the front: `${scope}-theme` → `theme-${scope}`, `${scope}-scheme` → `scheme-${scope}`. Existing cookies under the old names are ignored (users fall back to defaults once, then re-persist).
- **Scoped config is now self-contained per scope.** There's no top-level shared `themes` registry and no `themes: string[]` subset selector. Each scope declares its **own** `themes` (which can itself be axed) and its own `defaultTheme` / `defaultThemes`. Move your theme loaders into the scope that uses them.
- **`getThemeSource` is on the handle now** (it was root-only in 0.2.5) — available on both the handle and the package root.

## License

MIT
