import type { ThemeLoader } from './types.js';

export type NormalizedAxis = {
	name: string;
	themes: Record<string, ThemeLoader>;
};

export type NormalizedThemes = {
	/** true when the input was all loaders — a single anonymous axis named `default`. */
	flat: boolean;
	/** Ordered axes. Flat → one axis (`default`). Axed → `default` (if any bare/explicit) first, then named axes in declaration order. */
	axes: NormalizedAxis[];
};

const isLoader = (v: unknown): v is ThemeLoader => typeof v === 'function';

/**
 * Normalize a `themes` object (flat / axed / mixed) into an ordered axis list.
 *
 * - All loaders → flat: one anonymous axis named `default`.
 * - Any record present → axed: record values are named axes; bare loaders fold
 *   into the `default` axis, merging with an explicit `default` axis (explicit
 *   entries win on same-name collision).
 *
 * `label` is used in error messages (e.g. `createThemes` or `scope "admin"`).
 */
export function normalizeThemes(
	themes: Record<string, unknown>,
	label: string
): NormalizedThemes {
	const entries = Object.entries(themes);
	if (entries.length === 0) {
		throw new Error(`${label}: no themes provided`);
	}

	const hasAxis = entries.some(([, v]) => !isLoader(v));
	if (!hasAxis) {
		return {
			flat: true,
			axes: [{ name: 'default', themes: themes as Record<string, ThemeLoader> }]
		};
	}

	const bare: Record<string, ThemeLoader> = {};
	let explicitDefault: Record<string, ThemeLoader> | null = null;
	const named: NormalizedAxis[] = [];

	for (const [key, value] of entries) {
		if (isLoader(value)) {
			bare[key] = value;
			continue;
		}
		const rec = value as Record<string, unknown>;
		const themeKeys = Object.keys(rec);
		if (themeKeys.length === 0) {
			throw new Error(`${label}: axis "${key}" has no themes`);
		}
		for (const [tk, tv] of Object.entries(rec)) {
			if (!isLoader(tv)) {
				throw new Error(`${label}: axis "${key}" theme "${tk}" is not a loader function`);
			}
		}
		if (key === 'default') {
			explicitDefault = rec as Record<string, ThemeLoader>;
		} else {
			named.push({ name: key, themes: rec as Record<string, ThemeLoader> });
		}
	}

	const axes: NormalizedAxis[] = [];
	const hasBare = Object.keys(bare).length > 0;
	if (hasBare || explicitDefault) {
		// Merge bare loaders with the explicit `default` axis; explicit wins on collision.
		axes.push({ name: 'default', themes: { ...bare, ...(explicitDefault ?? {}) } });
	}
	axes.push(...named);

	return { flat: false, axes };
}
