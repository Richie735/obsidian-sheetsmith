/*
 * WCAG contrast between two colours the browser has already worked out.
 *
 * **Read off computed styles, never off a theme's variables.** A computed
 * colour is what the theme actually drew, whatever it named and however it
 * mixed it, so a caller measuring two computed colours measures the sheet the
 * reader sees rather than the default theme a stylesheet was written against
 * (`docs/features/form-tint-colour.md`, "The tag's text, picked at runtime").
 */

/** A colour as sRGB channels in 0..1. */
export type Rgb = readonly [number, number, number];

/** A computed colour and its alpha, 0..1. */
export interface Paint {
	rgb: Rgb;
	alpha: number;
}

/**
 * A computed colour and its alpha, or `null` for one this cannot read:
 * `rgb()`, `rgba()` and `color(srgb …)`, which is how a browser serialises the
 * result of a `color-mix`.
 */
export function readColour(css: string): Paint | null {
	const srgb = /color\(srgb\s+([\d.e-]+)\s+([\d.e-]+)\s+([\d.e-]+)(?:\s*\/\s*([\d.e-]+%?))?\s*\)/.exec(css);
	if (srgb) {
		return {
			rgb: [Number(srgb[1]), Number(srgb[2]), Number(srgb[3])],
			alpha: srgb[4] === undefined ? 1 : alphaOf(srgb[4]),
		};
	}
	const rgb = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)/.exec(css);
	if (rgb) {
		return {
			rgb: [Number(rgb[1]) / 255, Number(rgb[2]) / 255, Number(rgb[3]) / 255],
			alpha: rgb[4] === undefined ? 1 : alphaOf(rgb[4]),
		};
	}
	return null;
}

/**
 * A computed colour as sRGB, or `null` for one this cannot read or one with
 * alpha under 1, rather than a guess at what it sits on.
 */
export function parseColour(css: string): Rgb | null {
	const paint = readColour(css);
	return paint === null || paint.alpha < 1 ? null : paint.rgb;
}

/** `top` at `alpha` composited over an opaque `under`, as a browser lays one layer on another. */
export function over(top: Rgb, alpha: number, under: Rgb): Rgb {
	const mix = (a: number, b: number) => a * alpha + b * (1 - alpha);
	return [mix(top[0], under[0]), mix(top[1], under[1]), mix(top[2], under[2])];
}

function alphaOf(text: string): number {
	return text.endsWith('%') ? Number(text.slice(0, -1)) / 100 : Number(text);
}

/** WCAG 2's relative luminance. */
export function luminance([r, g, b]: Rgb): number {
	const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
	return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG 2's contrast ratio, 1 to 21, in either order. */
export function contrast(a: Rgb, b: Rgb): number {
	const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
	return (high + 0.05) / (low + 0.05);
}
