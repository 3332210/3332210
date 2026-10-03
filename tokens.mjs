/**
 * Design tokens — the code form of design-system.md.
 * Shared by every asset generator. Do not hardcode colors in lib/*.mjs.
 */

export const FRAME_W = 1100;
export const PAD = 28;
export const UNIT = 4;
export const RADIUS = 10;
export const HERO_H = 320;
export const GRAPH_H = 188;

/**
 * Font stacks.
 *
 * Single quotes only, deliberately. These strings are interpolated into XML
 * attributes (`font-family="..."`), where a double quote terminates the
 * attribute and turns the whole document into invalid XML. A stack written with
 * double quotes — the CSS convention — silently breaks every generated SVG.
 * Do not "fix" these back to double quotes.
 */
export const FONT_SANS =
  "ui-sans-serif, -apple-system, 'Segoe UI', Inter, Roboto, 'Helvetica Neue', Arial, sans-serif";
export const FONT_MONO =
  "ui-monospace, 'SF Mono', 'JetBrains Mono', 'Cascadia Code', Consolas, 'Liberation Mono', monospace";

/** Theme-invariant tokens + per-scheme overrides. */
export const THEMES = {
  dark: {
    bg0: '#0a0d14',
    bg1: '#0e121b',
    bg2: '#080a10',
    line: '#1c2230',
    lineStrong: '#2a3346',
    text1: '#e8edf7',
    text2: '#93a1bb',
    text3: '#5b6a86',
    accent: '#22d3ee',
    accent2: '#a78bfa',
    good: '#34d399',
    warn: '#fbbf24',
  },
  light: {
    bg0: '#ffffff',
    bg1: '#f9fafb',
    bg2: '#f3f4f6',
    line: '#e5e7eb',
    lineStrong: '#d1d5db',
    text1: '#0f172a',
    text2: '#475569',
    text3: '#94a3b8',
    accent: '#0891b2',
    accent2: '#7c3aed',
    good: '#059669',
    warn: '#d97706',
  },
};

/** Accent alpha ladder — use these, do not invent intermediate values. */
export const ALPHA = [0.08, 0.16, 0.32, 0.6, 1];

/** Contribution heat ramp, L0..L4 (alpha applied to theme accent). */
export const HEAT = [0, 0.18, 0.38, 0.62, 1];

export const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';
export const EASE_IN_OUT = 'cubic-bezier(0.65, 0, 0.35, 1)';
export const T_FAST = '180ms';
export const T_BASE = '320ms';
export const T_SLOW = '600ms';

/** Escape text for XML text nodes and attribute values. */
export function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Emit the shared <style> preamble: scheme switching + motion rules.
 * Every asset includes this so themes and reduced-motion behave identically.
 *
 * Scheme mechanism (do not change this without reading build.mjs):
 *   .<scope>                         -> dark tokens (the default)
 *   .<scope>-light.<scope>           -> light tokens, at higher specificity
 *   @media (prefers-color-scheme:light) .<scope> -> light tokens when the viewer is light
 *
 * The double-class selector means a *forced* theme is a pure specificity win,
 * with no reliance on `color-scheme` propagating into the media query — which
 * is genuinely unreliable across engines and would make the light-mode
 * screenshots that verify this asset meaningless. build.mjs swaps the root
 * class to `<scope>-light` to produce a deterministic light preview.
 *
 * Reduced motion — the trap this avoids, and why the rule is shaped this way:
 *
 *   The obvious reset is `.<scope> * { opacity: 1 !important }`. It reveals
 *   whatever an entrance animation was hiding — but it ALSO reveals anything
 *   hidden with `opacity: 0` for a different reason, which is every CSS-only
 *   tooltip in this kit. Those then sit permanently visible over the artwork for
 *   exactly the readers who asked for less movement.
 *
 *   So the reset is split in two, and the split is deliberate:
 *
 *   1. The clock is pinned automatically, for every animated element, with zero
 *      specificity (`:where()`). Nothing has to opt in, and a generator's own
 *      `opacity: 0 !important` rules still win — which is what keeps tooltips
 *      hidden. Requires no change in any generator.
 *
 *   2. Forcing `opacity: 1` / `transform: none` is opt-in via a `data-motion`
 *      marker, because it is only correct for elements whose whole purpose is
 *      an entrance that reduces to "just be visible". An asset that animates its
 *      entrance should mark its root with `data-motion="true"` (see hero.mjs).
 *      An asset that hides state interactively must NOT, or its tooltips would
 *      be permanently revealed.
 *
 * @param {object} opts
 * @param {string} opts.scope  root class, e.g. 'hero'
 * @param {object} [opts.overrides] map of tokenName -> css value, applied in both schemes
 */
export function styleBlock({ scope, overrides = {} } = {}) {
  const varLines = (theme) =>
    Object.entries(THEMES[theme])
      .map(([k, v]) => `--${kebab(k)}:${overrides[k] ?? v};`)
      .join('');

  return `<style>
    .${scope}{${varLines('dark')}}
    .${scope}-light.${scope}{${varLines('light')}}
    @media (prefers-color-scheme: light){.${scope}{${varLines('light')}}}
    .${scope} text{font-family:${FONT_SANS}}
    .${scope} .mono{font-family:${FONT_MONO}}
    @media (prefers-reduced-motion: reduce){
      :where(.${scope}, .${scope} *){animation-duration:.001s !important;animation-delay:0s !important;animation-iteration-count:1 !important;transition-duration:.001s !important;transition-delay:0s !important}
      .${scope}[data-motion],
      .${scope}[data-motion] *{opacity:1 !important;transform:none !important}
    }
  </style>`;
}

/**
 * Root class attribute value for a given scope + forced scheme.
 * Pass `scheme` only when forcing a theme; omit it for the shipped asset.
 */
export function rootClass(scope, scheme = null) {
  return scheme === 'light' ? `${scope} ${scope}-light` : scope;
}

function kebab(s) {
  return s.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()).replace(/^bg/, 'bg');
}

/** Convenience: run a numeric value through the accent alpha ladder. */
export function alpha(hex, a) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}

/** Merge a data object over defaults, shallow, returning a new object. */
export function withDefaults(data, defaults) {
  return { ...defaults, ...(data ?? {}) };
}
