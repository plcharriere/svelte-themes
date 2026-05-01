<script lang="ts">
	import { getCurrentTheme, getThemeSource, isDark, getScheme, getSchemeSource } from '$lib';
</script>

<div class="max-w-5xl space-y-8">
	<header
		class="bg-card text-card-foreground border border-border rounded-lg px-5 py-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm"
	>
		<div class="flex items-center gap-2">
			<span class="text-muted-foreground text-xs uppercase tracking-wider">Theme</span>
			<code class="font-mono">
				{getCurrentTheme()}
				<span class="text-muted-foreground">({getThemeSource()})</span>
			</code>
		</div>
		<div class="h-4 w-px bg-border"></div>
		<div class="flex items-center gap-2">
			<span class="text-muted-foreground text-xs uppercase tracking-wider">Scheme</span>
			<code class="font-mono">
				{#if getScheme() === 'system'}
					system <span class="text-muted-foreground">→ {isDark() ? 'dark' : 'light'}</span>
				{:else}
					{getScheme()}
				{/if}
				<span class="text-muted-foreground">({getSchemeSource()})</span>
			</code>
		</div>
	</header>

	<section class="grid gap-6 md:grid-cols-2">
		<article class="bg-card text-card-foreground rounded-lg border border-border p-6 shadow">
			<h2 class="font-serif text-xl font-semibold">Card</h2>
			<p class="text-muted-foreground mt-2">
				Uses <code class="font-mono text-xs">--card</code> and
				<code class="font-mono text-xs">--card-foreground</code>.
			</p>
			<div class="mt-4 flex flex-wrap gap-2">
				<button class="bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-sm shadow-xs">
					Primary
				</button>
				<button
					class="bg-secondary text-secondary-foreground rounded-md px-3 py-1.5 text-sm shadow-xs"
				>
					Secondary
				</button>
				<button class="bg-accent text-accent-foreground rounded-md px-3 py-1.5 text-sm shadow-xs">
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
		<div class="bg-card text-card-foreground rounded-lg border border-border p-6 shadow">
			<p class="font-sans text-lg">Sans — The quick brown fox jumps over the lazy dog.</p>
			<p class="font-serif text-lg mt-2">Serif — The quick brown fox jumps over the lazy dog.</p>
			<p class="font-mono text-sm mt-2">Mono — const greeting = "hello, world";</p>
		</div>
	</section>

	<section class="space-y-3">
		<h2 class="font-serif text-2xl font-semibold">Shadows</h2>
		<div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
			{#each ['shadow-xs', 'shadow-sm', 'shadow', 'shadow-md', 'shadow-lg', 'shadow-xl', 'shadow-2xl'] as s}
				<div class="bg-card text-card-foreground rounded-md border border-border p-4 {s}">
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
