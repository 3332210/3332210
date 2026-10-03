/**
 * Shared SVG primitives. Every asset in this kit is composed from these, which
 * is what keeps the set visually consistent — no asset invents its own card,
 * pill, or divider.
 *
 * All functions return SVG fragment strings. Every one is pure and deterministic.
 * Import tokens from tokens.mjs; never hardcode a colour here.
 *
 * XML SAFETY: every value interpolated into an attribute goes through `a()`.
 * This is not decoration. The first version of this file emitted
 * `font-family="${FONT_MONO}"` verbatim, and because the font stack itself
 * contains double quotes (`ui-monospace, "SF Mono", ...`) the attribute closed
 * early and the whole document became invalid XML. Browsers then render only up
 * to the error and print a red parse-error banner — a failure that is invisible
 * to any regex-based check and only shows up when the file is actually opened.
 */
import { RADIUS, PAD, FRAME_W, FONT_MONO, esc } from '../tokens.mjs';

/* ------------------------------------------------------------------ helpers */

/**
 * Escape a value for use inside a double-quoted XML attribute.
 * `&` must be first or it would double-escape the entities we introduce.
 */
function a(v) {
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Trim a float to at most 2 decimals, dropping trailing zeros — keeps output tidy. */
export function n(v) {
  const r = Math.round(v * 100) / 100;
  return String(r);
}

/** Attribute helper: `attr('x', 12)` -> ` x="12"`, or '' when the value is null. */
function attr(name, value) {
  if (value === null || value === undefined || value === '') return '';
  return ` ${name}="${a(value)}"`;
}

/* -------------------------------------------------------------- primitives */

/** Rounded rect. Always emits BOTH rx and ry — some rasterizers ignore rx alone. */
export function roundedRect({ x, y, w, h, r = RADIUS, fill = 'none', stroke = null, sw = 1, cls = '', extra = '' }) {
  return `<rect${attr('x', n(x))}${attr('y', n(y))}${attr('width', n(w))}${attr('height', n(h))}` +
    `${attr('rx', n(r))}${attr('ry', n(r))}${attr('fill', fill)}` +
    `${stroke ? attr('stroke', stroke) + attr('stroke-width', sw) : ''}` +
    `${attr('class', cls)}${extra ? ' ' + extra : ''}/>`;
}

/** Hairline rule. Defaults to the frame's inner width at the given padding. */
export function rule({ x = PAD, y, w = FRAME_W - PAD * 2, stroke = 'var(--line)', sw = 1, dash = null, cls = '' }) {
  return `<line${attr('x1', n(x))}${attr('y1', n(y))}${attr('x2', n(x + w))}${attr('y2', n(y))}` +
    `${attr('stroke', stroke)}${attr('stroke-width', sw)}${attr('stroke-dasharray', dash)}${attr('class', cls)}/>`;
}

/**
 * The canonical panel: raised background, hairline border, generous radius.
 * This is the only shape a "card" may be.
 */
export function panel({ x, y, w, h, r = RADIUS, cls = '', extra = '' }) {
  return roundedRect({ x, y, w, h, r, fill: 'var(--bg1)', stroke: 'var(--line)', sw: 1, cls, extra });
}

/** Section eyebrow label: uppercase, tracked, tertiary. */
export function label({ x, y, text, fill = 'var(--text3)', size = 11, anchor = 'start', cls = '', extra = '' }) {
  return `<text${attr('x', n(x))}${attr('y', n(y))}${attr('fill', fill)}${attr('font-size', size)}` +
    ` font-weight="500" letter-spacing="0.9"${attr('text-anchor', anchor)}${attr('class', cls)}` +
    `${extra ? ' ' + extra : ''}>${esc(text).toUpperCase()}</text>`;
}

/** Plain text node with explicit typographic control. */
export function text({ x, y, value, fill = 'var(--text1)', size = 16, weight = 400, anchor = 'start', mono = false, ls = null, opacity = null, cls = '', extra = '' }) {
  return `<text${attr('x', n(x))}${attr('y', n(y))}${attr('fill', fill)}${attr('font-size', n(size))}` +
    `${weight !== 400 ? attr('font-weight', weight) : ''}` +
    `${anchor !== 'start' ? attr('text-anchor', anchor) : ''}` +
    `${ls !== null ? attr('letter-spacing', ls) : ''}` +
    `${opacity !== null ? attr('opacity', opacity) : ''}` +
    `${mono ? attr('font-family', FONT_MONO) : ''}` +
    `${attr('class', cls)}${extra ? ' ' + extra : ''}>${esc(value)}</text>`;
}

/** Small pill: 1px border, 22px tall, mono-capable. Used for tags and facts. */
export function pill({ x, y, text: label_, w = null, h = 22, fill = 'var(--bg2)', stroke = 'var(--line)', color = 'var(--text2)', size = 12, mono = false, dot = null, cls = '', extra = '' }) {
  const width = w ?? Math.round(label_.length * (mono ? size * 0.62 : size * 0.56)) + 22 + (dot ? 10 : 0);
  const cx = x + (dot ? 19 : 11);
  const parts = [roundedRect({ x, y, w: width, h, r: h / 2, fill, stroke, cls })];
  if (dot) parts.push(`<circle${attr('cx', n(x + 11))}${attr('cy', n(y + h / 2))} r="3"${attr('fill', dot)}${attr('class', cls)}/>`);
  parts.push(text({ x: cx, y: y + h / 2 + size * 0.35, value: label_, fill: color, size, mono, cls }));
  return `<g${extra ? ' ' + extra : ''}>${parts.join('')}</g>`;
}

/** A labelled statistic: big number over a quiet caption. */
export function stat({ x, y, value, caption, size = 26, valueFill = 'var(--text1)', captionFill = 'var(--text3)', anchor = 'start', cls = '' }) {
  return [
    text({ x, y, value, fill: valueFill, size, weight: 650, anchor, ls: '-0.02em', cls }),
    text({ x, y: y + 17, value: caption, fill: captionFill, size: 11, anchor, ls: '0.9', cls }),
  ].join('');
}

/** Vertical accent tick used to mark the active item in a list. */
export function accentTick({ x, y, h, color = 'var(--accent)', w = 2, cls = '' }) {
  return roundedRect({ x, y, w, h, r: w / 2, fill: color, cls });
}

/** A grid of hairlines. `step` is the spacing; the grid is clipped if an id is given. */
export function hairlineGrid({ x, y, w, h, step = 32, stroke = 'var(--line)', opacity = 0.5, id = null }) {
  const clip = id ? attr('clip-path', `url(#${id})`) : '';
  const lines = [];
  for (let gx = x + step; gx < x + w; gx += step) {
    lines.push(`<line${attr('x1', n(gx))}${attr('y1', n(y))}${attr('x2', n(gx))}${attr('y2', n(y + h))}${attr('stroke', stroke)} stroke-width="1"/>`);
  }
  for (let gy = y + step; gy < y + h; gy += step) {
    lines.push(`<line${attr('x1', n(x))}${attr('y1', n(gy))}${attr('x2', n(x + w))}${attr('y2', n(gy))}${attr('stroke', stroke)} stroke-width="1"/>`);
  }
  return `<g${attr('opacity', opacity)}${clip}>${lines.join('')}</g>`;
}

/** A radial highlight, used sparingly (once per asset at most). */
export function glow({ id, cx, cy, r, color = 'var(--accent)', from = 0.18, to = 0 }) {
  return `<radialGradient${attr('id', id)} cx="50%" cy="50%" r="50%">` +
    `<stop offset="0%"${attr('stop-color', color)}${attr('stop-opacity', from)}/>` +
    `<stop offset="100%"${attr('stop-color', color)}${attr('stop-opacity', to)}/>` +
    `</radialGradient>`;
}

/** A linear gradient between two stops. */
export function linear({ id, from, to, x1 = '0%', y1 = '0%', x2 = '100%', y2 = '0%' }) {
  return `<linearGradient${attr('id', id)}${attr('x1', x1)}${attr('y1', y1)}${attr('x2', x2)}${attr('y2', y2)}>` +
    `<stop offset="0%"${attr('stop-color', from)}/>` +
    `<stop offset="100%"${attr('stop-color', to)}/>` +
    `</linearGradient>`;
}

/** Standard `<defs>` wrapper. */
export function defs(...children) {
  return `<defs>${children.join('')}</defs>`;
}

/**
 * Root <svg> with the accessibility contract applied.
 *
 * Assets must not hand-roll this — the role/title/desc triplet is required.
 *
 * The title/desc ids are derived from the FIRST class token (which is the asset
 * scope, because every generator passes `rootClass(scope, opts?.scheme)`), so
 * several assets can be inlined on one page without shadowing each other's
 * accessibility labels. Never hardcode `id="t"` here again: that made the
 * scope-id rule impossible to satisfy for every consumer at once.
 */
export function svgRoot({ w, h, title, desc, children, cls = '', style = '', extra = '' }) {
  const scope = String(cls).trim().split(/\s+/)[0] || 'svg';
  const tid = `${scope}-title`;
  const did = `${scope}-desc`;
  return `<svg xmlns="http://www.w3.org/2000/svg"${attr('width', w)}${attr('height', h)}` +
    `${attr('viewBox', `0 0 ${w} ${h}`)} role="img"${attr('aria-labelledby', `${tid} ${did}`)}` +
    `${attr('class', cls)}${attr('style', style)}${extra ? ' ' + extra : ''}>\n` +
    `  <title${attr('id', tid)}>${esc(title)}</title>\n` +
    `  <desc${attr('id', did)}>${esc(desc)}</desc>\n` +
    `  ${children}\n</svg>`;
}

/** Section header used by list-like assets: eyebrow + title + optional right meta. */
export function sectionHead({ x, y, eyebrow, title, right = null, cls = '' }) {
  const out = [label({ x, y, text: eyebrow, cls })];
  if (title) out.push(text({ x, y: y + 20, value: title, size: 15, weight: 600, cls }));
  if (right) out.push(text({ x: x + FRAME_W - PAD * 2, y: y + 20, value: right, size: 12, fill: 'var(--text3)', anchor: 'end', mono: true, cls }));
  return out.join('');
}

export { n as num, esc, a as attrEscape };
