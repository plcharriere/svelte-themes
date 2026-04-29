<script lang="ts">
	import {
		getThemes,
		getCurrentTheme,
		setTheme,
		isDarkTheme,
		setDarkTheme
	} from '$lib';

	const themes = getThemes();

	function prettify(name: string): string {
		return name
			.split('-')
			.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
			.join(' ');
	}

	function withTransition(
		fn: () => void | Promise<void>,
		origin?: { x: number; y: number }
	): void {
		if (typeof document === 'undefined' || !document.startViewTransition) {
			fn();
			return;
		}
		if (origin) {
			const x = (origin.x / window.innerWidth) * 100;
			const y = (origin.y / window.innerHeight) * 100;
			document.documentElement.style.setProperty('--x', `${x}%`);
			document.documentElement.style.setProperty('--y', `${y}%`);
		}
		document.startViewTransition(fn);
	}
</script>

<div class="min-h-screen bg-background text-foreground font-sans flex">
	<aside
		class="bg-background text-foreground border-r border-border w-64 shrink-0 p-6 flex flex-col gap-6 sticky top-0 h-screen"
	>
		<div>
			<h1 class="font-serif text-2xl font-bold">svelte-themes</h1>
			<p class="text-muted-foreground mt-1 text-xs">Pick a theme below.</p>
		</div>

		<div class="flex flex-col gap-2 flex-1 min-h-0">
			<p class="text-muted-foreground text-xs uppercase tracking-wider">Themes</p>
			<div class="flex-1 min-h-0 overflow-y-auto space-y-1 -mr-3 pr-3">
				{#each themes as name}
					{@const active = getCurrentTheme() === name}
					<button
						type="button"
						onclick={(e) =>
							withTransition(() => setTheme(name), {
								x: e.clientX,
								y: e.clientY
							})}
						aria-pressed={active}
						class="w-full text-left rounded-md px-3 py-2 text-sm cursor-pointer {active
							? 'bg-primary text-primary-foreground'
							: 'hover:bg-accent hover:text-accent-foreground'}"
					>
						{prettify(name)}
					</button>
				{/each}
			</div>
		</div>

		<div class="mt-auto flex gap-2">
			<button
				type="button"
				aria-label="Toggle dark mode"
				onclick={(e) =>
					withTransition(() => setDarkTheme(!isDarkTheme()), {
						x: e.clientX,
						y: e.clientY
					})}
				class="flex-1 flex items-center justify-center gap-2 rounded-md bg-secondary text-secondary-foreground hover:opacity-90 transition px-3 py-2 text-sm cursor-pointer"
			>
				<svg
					class="dark:hidden"
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<circle cx="12" cy="12" r="4" />
					<path
						d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
					/>
				</svg>
				<svg
					class="hidden dark:block"
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
				</svg>
			</button>
			<a
				href="https://github.com/plcharriere/svelte-themes"
				target="_blank"
				rel="noopener noreferrer"
				aria-label="View on GitHub"
				class="shrink-0 self-stretch aspect-square grid place-items-center rounded-md bg-secondary text-secondary-foreground hover:opacity-90 transition"
			>
				<svg
					width="18"
					height="18"
					viewBox="0 0 24 24"
					fill="currentColor"
					aria-hidden="true"
				>
					<path
						d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.4 3-.405 1.02.005 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"
					/>
				</svg>
			</a>
		</div>
	</aside>

	<main class="flex-1 p-8">
		<div class="max-w-5xl space-y-8">
			<header>
				<p class="text-muted-foreground">
					Active theme: <code class="font-mono text-sm">{getCurrentTheme()}</code> ·
					{isDarkTheme() ? 'dark' : 'light'}
				</p>
			</header>

			<section class="grid gap-6 md:grid-cols-2">
				<article
					class="bg-card text-card-foreground rounded-lg border border-border p-6 shadow"
				>
					<h2 class="font-serif text-xl font-semibold">Card</h2>
					<p class="text-muted-foreground mt-2">
						Uses <code class="font-mono text-xs">--card</code> and
						<code class="font-mono text-xs">--card-foreground</code>.
					</p>
					<div class="mt-4 flex flex-wrap gap-2">
						<button
							class="bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-sm shadow-xs"
						>
							Primary
						</button>
						<button
							class="bg-secondary text-secondary-foreground rounded-md px-3 py-1.5 text-sm shadow-xs"
						>
							Secondary
						</button>
						<button
							class="bg-accent text-accent-foreground rounded-md px-3 py-1.5 text-sm shadow-xs"
						>
							Accent
						</button>
						<button
							class="bg-destructive text-destructive-foreground rounded-md px-3 py-1.5 text-sm shadow-xs"
						>
							Destructive
						</button>
					</div>
				</article>

				<article
					class="bg-popover text-popover-foreground rounded-lg border border-border p-6 shadow-md"
				>
					<h2 class="font-serif text-xl font-semibold">Inputs</h2>
					<label class="mt-4 block">
						<span class="text-muted-foreground text-sm">Email</span>
						<input
							type="email"
							placeholder="you@example.com"
							class="bg-input text-foreground mt-1 block w-full rounded-md border border-border px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
						/>
					</label>
					<label class="mt-4 block">
						<span class="text-muted-foreground text-sm">Message</span>
						<textarea
							rows="3"
							placeholder="Type something…"
							class="bg-input text-foreground mt-1 block w-full rounded-md border border-border px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
						></textarea>
					</label>
				</article>
			</section>

			<section class="space-y-3">
				<h2 class="font-serif text-2xl font-semibold">Color palette</h2>
				<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
					{#each ['background', 'foreground', 'card', 'popover', 'primary', 'secondary', 'muted', 'accent', 'destructive', 'border', 'input', 'ring'] as token}
						<div class="rounded-md border border-border overflow-hidden shadow-xs">
							<div class="h-16 w-full" style="background-color: var(--{token});"></div>
							<div class="bg-card text-card-foreground px-3 py-2">
								<div class="font-mono text-xs">--{token}</div>
							</div>
						</div>
					{/each}
				</div>
			</section>

			<section class="space-y-3">
				<h2 class="font-serif text-2xl font-semibold">Typography</h2>
				<div
					class="bg-card text-card-foreground rounded-lg border border-border p-6 shadow"
				>
					<p class="font-sans text-lg">
						Sans — The quick brown fox jumps over the lazy dog.
					</p>
					<p class="font-serif text-lg mt-2">
						Serif — The quick brown fox jumps over the lazy dog.
					</p>
					<p class="font-mono text-sm mt-2">
						Mono — const greeting = "hello, world";
					</p>
				</div>
			</section>

			<section class="space-y-3">
				<h2 class="font-serif text-2xl font-semibold">Shadows</h2>
				<div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
					{#each ['shadow-xs', 'shadow-sm', 'shadow', 'shadow-md', 'shadow-lg', 'shadow-xl', 'shadow-2xl'] as s}
						<div
							class="bg-card text-card-foreground rounded-md border border-border p-4 {s}"
						>
							<div class="font-mono text-xs">{s}</div>
						</div>
					{/each}
				</div>
			</section>

			<section class="space-y-3">
				<h2 class="font-serif text-2xl font-semibold">Radius</h2>
				<div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
					{#each ['rounded-sm', 'rounded-md', 'rounded-lg', 'rounded-xl'] as r}
						<div
							class="bg-card text-card-foreground border border-border p-6 flex items-center justify-center {r}"
						>
							<span class="font-mono text-xs">{r}</span>
						</div>
					{/each}
				</div>
			</section>
		</div>
	</main>
</div>
