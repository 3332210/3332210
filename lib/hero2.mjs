/**
 * hero2.mjs — the INKWARD hero banner and the work list, for the GitHub profile
 * of `3332210`. Replaces the product-page styling of the first hero with the
 * design language established by `portfolio/DESIGN.md`.
 *
 * ── The proposition ─────────────────────────────────────────────────────────
 *
 * `-ward` is the Old English suffix of direction and keeping; its stem is `ink`.
 * "The grandest suffix, spent on the smallest thing." Visually that is a REAL
 * SCALE GAP: enormous type against tiny metadata and nothing in between
 * (DESIGN.md §1 ①). So the plate carries exactly three sizes — a ~199 unit
 * wordmark, a 15 unit positioning line, and 11 unit mono metadata. There is no
 * 20–40 unit element anywhere, by construction.
 *
 * The signature device is the wordmark itself: "INK" is HOLLOW (outline, no
 * fill — not yet written) and "WARD" is SOLID (inked), with 守墨 beneath it.
 *
 * ── The field, and the two bugs it exists to avoid ──────────────────────────
 *
 * The generative pixel field is computed here at build time from the Perlin +
 * FBM implementation in `portfolio/src/noise.js` (imported, not reimplemented)
 * and emitted as plain <rect> elements. `portfolio/src/field.js` records two
 * hard-won facts, and both are honoured literally:
 *
 *  1. NOISE IS ZERO ON THE LATTICE. Perlin is exactly 0 at every integer
 *     coordinate, so sampling `gx / scale` lands on lattice points, the field
 *     evaluates to a constant and NOTHING crosses any threshold. Every sample
 *     is taken at a cell CENTRE — `(gx + 0.5) / scale`.
 *
 *  2. THE THRESHOLD MUST BE CALIBRATED, NOT CHOSEN. This 3-octave FBM spans
 *     roughly 0.2–0.81, not 0–1 (see `distribution()` on the report). A
 *     hand-picked cut at 0.87 lights nothing, which reads as a canvas bug
 *     rather than an arithmetic one. So this generator measures the field's own
 *     distribution over the cells it is about to draw and BINARY-SEARCHES the
 *     cut-off that lights exactly the target coverage. It is exact rather than
 *     quantile-approximated, and it is why the field is not empty.
 *
 * ── The field falls quiet around the type ───────────────────────────────────
 *
 * A dense field behind a wordmark makes the wordmark unreadable; that exact
 * mistake was already made once on the site. So each type block contributes a
 * box, and each cell's quiet factor is the smoothest falloff of its distance
 * from those boxes. The factor does two things at once:
 *
 *   - DENSITY: a cell is kept only when `hash2(...) <= quiet`, so the field
 *     thins out instead of being punched into a rectangle with hard edges;
 *   - OPACITY: the surviving cell's intensity is attenuated by `quiet` before
 *     it is quantised onto the alpha ladder, so cells near the type fall to the
 *     bottom rung (~0.04, field.js's EXCLUDE_ALPHA) and read as material under
 *     paper rather than as a hole in the field.
 *
 * The display block (wordmark + caption) gets a deep floor; the two metadata
 * islands get a shallow one, because they are small and would otherwise sit in
 * the densest part of the cloud. The boxes are derived from the layout
 * constants below, so moving the type moves the quiet zone with it.
 *
 * ── Motion (design-system.md §4, DESIGN.md §5) ──────────────────────────────
 *
 * CSS only, three keyframes, no script, no SMIL. Every animated property's
 * FINAL value is also its base value, so a client that ignores CSS animations,
 * a rasteriser, and a reader with `prefers-reduced-motion` all get the finished
 * frame — the shared reduced-motion rule in tokens.styleBlock pins the clock,
 * which lands every animation on its 100% keyframe. The root deliberately does
 * NOT carry `data-motion`: that rule forces `opacity:1 !important` on every
 * descendant, which would flatten the field's per-cell alpha ladder.
 *
 * ── Contract ────────────────────────────────────────────────────────────────
 *
 *   render(data, opts)      -> { svg }   the hero (1100 × 360) -> assets/hero.svg
 *   renderWork(data, opts)  -> { svg }   the work list (1100 × n) -> assets/work.svg
 *   markdown(data)          -> string    the paired links for the README
 *   diagnostics(data)       -> object    field/layout numbers, for the build log
 *
 *   opts.scheme === 'light' forces the light variant through tokens.rootClass.
 *   render(data) with no opts is byte-identical to the shipped asset.
 *   Deterministic: same input, byte-identical output (no Date, no Math.random,
 *   no locale-dependent sort).
 *
 * Data — everything is optional; nothing is invented (content-guide.md §2/§3):
 *   data.user.login, data.user.publicRepos, data.generatedAt
 *   data.repos[] { name, description, htmlUrl, language, stars, pushedAt }
 *   data.featured { name, license, stars }
 */
import { makePerlin, makeFbm, hash2 } from '../../portfolio/src/noise.js';
import { FRAME_W, PAD, styleBlock, rootClass, esc } from '../tokens.mjs';
import { roundedRect, n, attrEscape, svgRoot } from './primitives.mjs';

/* ============================================================== palette ==== */

/**
 * The INKWARD tokens (DESIGN.md §1 ③), per scheme.
 *
 * These are deliberately NOT the kit's `--bg0/--text1` product-page tokens:
 * that palette is a dev-tool blue-black, and the whole point of this pass is
 * that the profile artwork carries the site's material instead. They are
 * emitted on the same scope pattern as every other asset, so the forced-light
 * preview works exactly like the rest of the kit.
 *
 * `ink3` is defined (it is a real design token) but no TEXT uses it: at
 * #4A4A52 on #0E0E10 it measures ~2.2:1, under DESIGN.md §7's own 3:1 floor for
 * metadata, and the field behind it only makes that worse. It is available for
 * rules and fills; all copy sits at ink2 (5.6:1 dark, 4.5:1 light) or above.
 */
const PALETTE = {
  dark: {
    paper: '#0E0E10', ink: '#F5F5F0', ink2: '#8A8A93', ink3: '#4A4A52',
    rule: '#232327', acid: '#C8FF4D', fieldInk: '#F5F5F0', fieldAcid: '#C8FF4D',
    ease: 'cubic-bezier(.16,.7,0,1)',
  },
  light: {
    paper: '#F2EFE9', ink: '#0B0B0D', ink2: '#6B6B72', ink3: '#9A9A9E',
    rule: '#DEDAD1', acid: '#5C7A00', fieldInk: '#2A2A2E', fieldAcid: '#5C7A00',
    ease: 'cubic-bezier(.16,.7,0,1)',
  },
};

const kebab = (s) => s.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());

/** `.scope{...}` / `.scope-light.scope{...}` / `@media (prefers-color-scheme:light){...}` */
function paletteCSS(scope) {
  const vars = (scheme) =>
    Object.entries(PALETTE[scheme]).map(([k, v]) => `--${kebab(k)}:${v};`).join('');
  return [
    `.${scope}{${vars('dark')}}`,
    `.${scope}-light.${scope}{${vars('light')}}`,
    `@media (prefers-color-scheme: light){.${scope}{${vars('light')}}}`,
  ].join('\n    ');
}

/* =============================================================== markup ==== */

/** Attribute helper: `at('x', 12)` -> ` x="12"`, or '' when empty. */
function at(name, value) {
  if (value === null || value === undefined || value === '') return '';
  return ` ${name}="${attrEscape(value)}"`;
}

/** Plain rect (no radius). rx/ry are absent rather than unpaired — see primitives. */
function rect({ x, y, w, h, fill = null, stroke = null, sw = null, cls = null, id = null }) {
  return `<rect${at('x', n(x))}${at('y', n(y))}${at('width', n(w))}${at('height', n(h))}` +
    `${at('fill', fill)}${stroke ? at('stroke', stroke) + at('stroke-width', sw ?? 1) : ''}` +
    `${at('class', cls)}${at('id', id)}/>`;
}

/** Text node with explicit typographic control. `text` is a text node -> esc(). */
function txt({ x, y, value, fill = null, size = 16, weight = null, anchor = null, mono = false,
  cjk = false, display = false, ls = null, cls = null, id = null }) {
  const fam = display ? 'display' : cjk ? 'cjk' : mono ? 'mono' : null;
  return `<text${at('x', n(x))}${at('y', n(y))}${at('fill', fill)}${at('font-size', n(size))}` +
    `${weight ? at('font-weight', weight) : ''}${anchor ? at('text-anchor', anchor) : ''}` +
    `${ls !== null ? at('letter-spacing', ls) : ''}${at('class', fam ? `${fam}${cls ? ' ' + cls : ''}` : cls)}` +
    `${at('id', id)}>${esc(value)}</text>`;
}

/** Hairline. Never thinner than 1 unit. */
function hairline(x1, y, x2, stroke = 'var(--rule)') {
  return `<line${at('x1', n(x1))}${at('y1', n(y))}${at('x2', n(x2))}${at('y2', n(y))}${at('stroke', stroke)} stroke-width="1"/>`;
}

/** Filled diamond — the one sanctioned accent dot (the site's `◆` eyebrow mark). */
function diamond(cx, cy, r, fill) {
  return `<path d="M${n(cx)} ${n(cy - r)}L${n(cx + r)} ${n(cy)}L${n(cx)} ${n(cy + r)}L${n(cx - r)} ${n(cy)}Z"${at('fill', fill)}/>`;
}

/** Real 5-point star geometry — the star count must not depend on a font glyph. */
function star(cx, cy, r, fill) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? r : r * 0.42;
    pts.push(`${n(cx + Math.cos(a) * rad)} ${n(cy + Math.sin(a) * rad)}`);
  }
  return `<path d="M${pts[0]}L${pts.slice(1).join('L')}Z"${at('fill', fill)}/>`;
}

/** The ↗ glyph: drawn, so it cannot come out as a missing-glyph box. */
function arrow(x, y, s, cls = null) {
  const tail = `${n(x + s * 0.08)} ${n(y - s * 0.08)}`;
  const tip = `${n(x + s * 0.86)} ${n(y - s * 0.86)}`;
  const h = s * 0.42;
  return `<path${at('d', `M${tail}L${tip}M${n(x + s * 0.86 - h)} ${n(y - s * 0.86)}L${tip}L${n(x + s * 0.86)} ${n(y - s * 0.86 + h)}`)}` +
    ` fill="none"${at('stroke', 'var(--ink-2)')} stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"${at('class', cls)}/>`;
}

/* ========================================================= text metrics ==== */

/** Helvetica-class advance widths in em — the widest common ancestor of the stacks. */
const EM = {
  ' ': 0.278, '!': 0.278, '"': 0.355, '#': 0.556, $: 0.556, '%': 0.889, '&': 0.667, "'": 0.191,
  '(': 0.333, ')': 0.333, '*': 0.389, '+': 0.584, ',': 0.278, '-': 0.333, '.': 0.278, '/': 0.278,
  0: 0.556, 1: 0.556, 2: 0.556, 3: 0.556, 4: 0.556, 5: 0.556, 6: 0.556, 7: 0.556, 8: 0.556, 9: 0.556,
  ':': 0.278, ';': 0.278, '<': 0.584, '=': 0.584, '>': 0.584, '?': 0.556, '@': 1.015,
  '[': 0.278, '\\': 0.278, ']': 0.278, '^': 0.469, _: 0.556, '`': 0.333,
  '{': 0.334, '|': 0.26, '}': 0.334, '~': 0.584,
  A: 0.667, B: 0.667, C: 0.722, D: 0.722, E: 0.667, F: 0.611, G: 0.778, H: 0.722, I: 0.278,
  J: 0.5, K: 0.667, L: 0.556, M: 0.833, N: 0.722, O: 0.778, P: 0.667, Q: 0.778, R: 0.722,
  S: 0.667, T: 0.611, U: 0.722, V: 0.667, W: 0.944, X: 0.667, Y: 0.667, Z: 0.611,
  a: 0.556, b: 0.556, c: 0.5, d: 0.556, e: 0.556, f: 0.278, g: 0.556, h: 0.556, i: 0.222,
  j: 0.222, k: 0.5, l: 0.222, m: 0.833, n: 0.556, o: 0.556, p: 0.556, q: 0.556, r: 0.333,
  s: 0.5, t: 0.278, u: 0.556, v: 0.5, w: 0.722, x: 0.5, y: 0.5, z: 0.5,
  '—': 1, '–': 0.556, '·': 0.333, '…': 0.9, '★': 0.9, '↗': 0.9, '≥': 0.584,
};

/** Measured mono advance on this stack: Consolas-class 0.55 em, Cascadia 0.60 em. */
const MONO_ADV = 0.6;
/** A wide CJK glyph advances one full em. */
const WIDE_ADV = 1;

function advWidth(s, size, { mono = false, tracking = 0 } = {}) {
  const chars = [...String(s)];
  let em = 0;
  for (const c of chars) {
    em += mono ? MONO_ADV : EM[c] ?? (c.codePointAt(0) >= 0x2e80 ? WIDE_ADV : 0.52);
  }
  return (em + tracking * Math.max(0, chars.length - 1)) * size;
}

/** Largest prefix that fits `maxW`, ellipsised. Used only where clipping would be worse. */
function truncate(s, maxW, size, opts = {}) {
  const str = String(s);
  if (advWidth(str, size, opts) <= maxW) return str;
  const chars = [...str];
  const ell = advWidth('…', size, opts);
  for (let k = chars.length - 1; k > 0; k--) {
    const cand = chars.slice(0, k).join('').replace(/[\s,;:·—-]+$/, '');
    if (advWidth(cand, size, opts) + ell <= maxW) return cand + '…';
  }
  return '…';
}

/** Upper-case a label without touching CJK. */
const up = (s) => String(s).toUpperCase();

/* ================================================================ field ==== */

/**
 * Field geometry. Measured constants, not invented ones.
 *
 * CELL/STEP are DESIGN.md §4's verified originals (5 px square, 2 px gap) — the
 * site's own material. At 1100 units the frame renders at ~830 CSS px, so a
 * cell is ~3.8 CSS px: the same texture the site shows, rather than a chunky
 * mosaic that reads as a pattern.
 *
 * FEATURE_UNITS is one noise unit in user units. `field.js` gives one noise unit
 * ~52 cells of 7 px ≈ 364 px, i.e. ~2.7 features across a 1000 px viewport.
 * 170 units here yields ~6.5 features across 1100 units and ~2.1 down 360 —
 * enough structure that the band reads as weather rather than as one blob.
 *
 * COVERAGE is field.js's single tuning knob, raised from 0.17 because this
 * frame loses a large share of its cells to the type's quiet zone.
 */
const FIELD = {
  cell: 5,
  step: 7,
  octaves: 3,
  featureUnits: 170,
  coverage: 0.45,
  jitter: 0.05,
  accentRatio: 0.26,
  seed: 20261004,
  /**
   * The crop of the noise the plate shows — chosen by scoring 357 windows on
   * band coverage and evenness (`_scratch/hero2/tune-origin.mjs`), not by eye.
   * The first window used here piled three quarters of the band into one solid
   * block in the top-right corner; this one spreads it and leaves no corner
   * solid. The cells themselves are still the noise's own.
   */
  origin: [0, 32],
  /**
   * The field's own opacity ladder, spanning field.js's ALPHA_MIN..ALPHA_MAX.
   * Six rungs chosen by class rather than a per-cell `fill-opacity` attribute:
   * one short class token on 1 300 rects instead of 18 bytes each. The bottom
   * rung is field.js's EXCLUDE_ALPHA (0.05) — what the site keeps inside its
   * quiet well, where the material is still present but cannot be read.
   */
  alpha: [0.04, 0.09, 0.15, 0.22, 0.29, 0.36],
  /** See `buildField`: lifts the mid-range of the noise onto the ladder. */
  gamma: 0.6,
  /** Reveal stagger: this many delay bands, spread over STAGGER_MS. */
  bands: 10,
  staggerMs: 540,
};

/**
 * Quiet factor for a point: the coolest (smallest) falloff over every type box.
 *
 * Smoothstep rather than linear: a straight ramp leaves a visible contour where
 * the derivative jumps, and this fade has to be invisible as a shape — the
 * reader should only notice that the type is legible.
 */
function quietAt(x, y, boxes) {
  let q = 1;
  for (const b of boxes) {
    const dx = x < b.x0 ? b.x0 - x : x > b.x1 ? x - b.x1 : 0;
    const dy = y < b.y0 ? b.y0 - y : y > b.y1 ? y - b.y1 : 0;
    const d = dx || dy ? Math.hypot(dx, dy) : 0;
    const t = Math.min(1, d / b.feather);
    const f = b.floor + (1 - b.floor) * (t * t * (3 - 2 * t));
    if (f < q) q = f;
  }
  return q;
}

/**
 * Compute, calibrate and emit the field.
 *
 * @param {{x0:number,y0:number,x1:number,y1:number,floor:number,feather:number}[]} boxes
 * @returns {{ink:string, acid:string, report:object}}
 */
function buildField(boxes) {
  const { cell, step, featureUnits, coverage, jitter, accentRatio, alpha, bands, staggerMs } = FIELD;
  const W = FRAME_W;
  const H = HERO_H;
  const scale = featureUnits / step;

  const fbm = makeFbm(makePerlin(FIELD.seed), { octaves: FIELD.octaves });
  const cols = Math.ceil(W / step);
  const rows = Math.ceil(H / step);

  /* 1. Sample at cell CENTRES. `gx / scale` would land on the integer lattice,
   *    where Perlin is identically zero — see the header. */
  const cells = [];
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const b = (fbm((gx + 0.5) / scale + FIELD.origin[0], (gy + 0.5) / scale + FIELD.origin[1]) + 1) * 0.5;
      cells.push({ gx, gy, b });
    }
  }

  /* 2. CALIBRATE. Measure this FBM's actual distribution over exactly the cells
   *    about to be drawn, then binary-search the cut-off that lights COVERAGE of
   *    them once the ragged-edge jitter is included (the jitter lowers each
   *    cell's effective cut by up to JITTER, so the search is done against the
   *    real test rather than against a closed form). */
  const sorted = cells.map((c) => c.b).sort((a, b) => a - b);
  const target = coverage * cells.length;
  const litAt = (cut) => {
    let k = 0;
    for (const c of cells) if (c.b > cut - hash2(c.gx, c.gy) * jitter) k++;
    return k;
  };
  let lo = sorted[0];
  let hi = sorted[sorted.length - 1];
  for (let i = 0; i < 42; i++) {
    const mid = (lo + hi) / 2;
    if (litAt(mid) > target) lo = mid;
    else hi = mid;
  }
  const cut = (lo + hi) / 2;
  const span = Math.max(0.04, sorted[sorted.length - 1] - cut);

  const distribution = {
    min: sorted[0],
    median: sorted[(sorted.length / 2) | 0],
    max: sorted[sorted.length - 1],
    cut,
    cells: cells.length,
    lit: litAt(cut),
  };

  /* 3. Emit. Two groups (ink / accent) so 1 200+ rects need no per-rect fill. */
  const ink = [];
  const acid = [];
  let accented = 0;
  let quietSum = 0;
  let litCount = 0;
  for (const { gx, gy, b } of cells) {
    if (!(b > cut - hash2(gx, gy) * jitter)) continue;
    litCount++;

    const x = gx * step;
    const y = gy * step;
    const quiet = quietAt(x + cell / 2, y + cell / 2, boxes);
    quietSum += quiet;
    /* Density falloff: deterministic thinning, not a rectangle cut out of the
     * grid. hash2 is sampled off the noise lattice so it cannot correlate with
     * the threshold jitter or the colour draw. */
    if (quiet < 1 && hash2(gx + 101, gy + 57) > quiet) continue;

    /* `over` is clamped at BOTH ends. It goes negative for the cells the ragged
     * jitter let through while still below the cut (that is the point of the
     * jitter), and an unclamped floor() then produced rung -1 and -2: classes
     * that no rule matches, so those cells inherited fill-opacity 1 and painted
     * SOLID WHITE inside the quiet zone, over the caption, at full strength —
     * a bug that only shows up in the pixels, never in the markup's shape.
     *
     * GAMMA. A 3-octave FBM spends most of its mass just above the cut, so a
     * linear map onto the ladder puts two thirds of the lit cells on the bottom
     * rung and the cloud comes out as haze. The gamma lifts the middle without
     * touching the peaks (over = 1 stays 1), so the bright cores stay bright and
     * the body of the cloud becomes visible material. */
    const over = Math.max(0, Math.min(1, (b - cut) / span));
    const tone = Math.pow(over, FIELD.gamma);
    const level = Math.max(0, Math.min(alpha.length - 1, Math.floor(tone * quiet * alpha.length)));
    const band = Math.min(bands - 1, Math.floor(hash2(gx + 5, gy + 9) * bands));
    const accent = hash2(gy, gx) < accentRatio;
    if (accent) accented++;
    (accent ? acid : ink).push(
      `<rect class="f${level} s${band}"${at('x', x)}${at('y', y)}${at('width', cell)}${at('height', cell)}/>`,
    );
  }

  return {
    ink: ink.join(''),
    acid: acid.join(''),
    report: {
      ...distribution,
      coverage: coverage,
      emitted: ink.length + acid.length,
      accentShare: ink.length + acid.length ? accented / (ink.length + acid.length) : 0,
      /* Mean quiet factor over the LIT cells, i.e. the cells the falloff acts on. */
      meanQuietOfLit: litCount ? quietSum / litCount : 0,
      step,
      cell,
      cols,
      rows,
    },
  };
}

/** The field's own CSS: the alpha ladder and the reveal stagger. */
function fieldCSS() {
  const out = [
    `.${HERO_SCOPE} .hero2-field rect{animation-name:hero2-bloom;animation-duration:640ms;` +
    `animation-timing-function:var(--ease);animation-fill-mode:both;` +
    `transform-box:fill-box;transform-origin:center}`,
  ];
  FIELD.alpha.forEach((a, i) => out.push(`.${HERO_SCOPE} .hero2-field .f${i}{fill-opacity:${a}}`));
  for (let i = 0; i < FIELD.bands; i++) {
    const delay = Math.round((i * FIELD.staggerMs) / (FIELD.bands - 1));
    out.push(`.${HERO_SCOPE} .hero2-field .s${i}{animation-delay:${delay}ms}`);
  }
  return out.join('\n    ');
}

/* ================================================================= hero ==== */

const HERO_SCOPE = 'hero2';
const HERO_W = FRAME_W;          // 1100
const HERO_H = 360;

const EDGE = 32;                 // this plate's padding (the kit's 28 is for panels)
const RIGHT = HERO_W - EDGE;     // 1068

const STRIP_Y = 44;              // metadata islands' baseline
const DISPLAY_Y = 292;           // wordmark baseline
/**
 * Wordmark size and advance.
 *
 * Measured in the browser (see `_scratch/hero2/probe-type.json`): this stack
 * resolves to Arial Black, whose advance for "INKWARD" with -0.03 em tracking
 * is 5.179 em at any size, and whose cap height is 0.716 em. 199 units therefore
 * advances 1030 units — the plate minus 35 units of air either side — and the
 * caps stand 142 units tall. `textLength` locks that advance on every platform:
 * the natural run and the locked run are within 0.1% here, so this box is not
 * distorted, while a machine whose fallback font is narrower or wider still gets
 * the same wordmark in the same place. `spacingAndGlyphs` (not `spacing`) is the
 * point: spacing-only adjustment would open gaps instead of holding the shape.
 */
const DISPLAY_SIZE = 199;
const DISPLAY_ADVANCE = 1030;
const CAP_RATIO = 0.716;
const DISPLAY_CAP_TOP = DISPLAY_Y - CAP_RATIO * DISPLAY_SIZE;   // 149.5

const CJK_Y = 340;               // 守墨 baseline
const CJK_SIZE = 42;
const LEDE_SIZE = 15;            // the Chinese positioning line — body, per §1
const LEDE_EN_SIZE = 12;         // its compact English counterpart
const STRIP_SIZE = 11;           // metadata only

const TEXT_RISE_Y = 16;          // px of the type reveal

/**
 * The quiet boxes, derived from the layout above — never hand-placed.
 * @param {number} islandW measured width of the metadata island
 */
function heroQuietBoxes(islandW) {
  return [
    {
      /* The display block: the wordmark + the caption row underneath.
       *
       * The box is deliberately WIDER than the plate and TALLER than the frame:
       * every cell in the frame is then horizontally inside it, so the falloff
       * is a function of height alone — a soft horizontal dissolve from the
       * cloud down into the type, with no vertical seam at the left or right
       * edge and no stray cells creeping under the caption. The feather is
       * longer than the gap between the cap top and the metadata island: the
       * field has to dissolve INTO the type over ~70 units, or the quiet zone
       * reads as a rectangle with an edge. */
      x0: -40,
      y0: DISPLAY_CAP_TOP - 6,
      x1: HERO_W + 40,
      y1: HERO_H + 12,
      floor: 0.10,
      feather: 72,
    },
    {
      /* The metadata island. Shallow, and small: it is 11 units of mono, and it
       * must not clear a canyon through the densest part of the cloud. */
      x0: EDGE - 8,
      y0: STRIP_Y - 14,
      x1: EDGE + 24 + Math.ceil(islandW) + 8,
      y1: STRIP_Y + 8,
      floor: 0.12,
      feather: 30,
    },
  ];
}

/** Hero copy + the numbers the plate is allowed to claim (all from stats.json). */
function heroModel(data) {
  const d = data ?? {};
  const user = d.user ?? {};
  const repos = Array.isArray(d.repos) ? d.repos.filter(Boolean) : [];
  const featured = d.featured ?? repos.find((r) => Number(r?.stars) > 0) ?? repos[0] ?? null;

  const login = String(user.login ?? d.login ?? '3332210');
  const repoCount = Number.isFinite(user.publicRepos) ? user.publicRepos : repos.length;
  const stars = repos.length
    ? repos.reduce((sum, r) => sum + (Number(r?.stars) || 0), 0)
    : Number(featured?.stars ?? 0);
  const license = featured?.license ?? repos.map((r) => r?.license).find(Boolean) ?? null;
  const updated = typeof d.generatedAt === 'string' ? d.generatedAt.slice(0, 10) : null;

  const facts = [
    `${repoCount} ${repoCount === 1 ? 'REPO' : 'REPOS'}`,
    `${stars} ${stars === 1 ? 'STAR' : 'STARS'}`,
    license ? up(license) : null,
  ].filter(Boolean).join(' · ');

  return {
    login,
    facts,
    updated: updated ? `UPDATED ${updated}` : null,
    /* The site's own positioning line, Chinese first with its English
     * counterpart directly under it (content-guide.md §3.6). Both are the
     * portfolio's copy, not new prose. */
    ledeZh: '写工具，解决那些每个人都默默忍受的小问题。',
    ledeEn: 'Small tools for problems everyone quietly puts up with.',
    cjk: '守墨',
    title: 'INKWARD · 守墨 — GitHub 个人横幅',
    desc:
      '守墨（INKWARD）的个人主页横幅。巨大的字标中，INK 是空心描边、WARD 是实心，' +
      '下面一行是中文名「守墨」。字标背后是一层按三倍频 Perlin 噪声生成的像素场，' +
      '它在字标周围自动变稀、变淡，所以字始终清楚。左上角是公开仓库、星标与许可证，' +
      '右下角是一句中英对照的定位语，仓库列表与更新时间在下方的工作清单里。',
  };
}

/** Hero motion: three keyframes for the whole asset. */
function heroMotionCSS() {
  const s = `.${HERO_SCOPE}`;
  return [
    /* The field blooms in on a scattered per-cell stagger — the pixels are
     * waking up, not sliding in, which is what the material wants. */
    '@keyframes hero2-bloom{from{opacity:0;transform:scale(.45)}to{opacity:1;transform:scale(1)}}',
    /* The reveal used by every type block. */
    `@keyframes hero2-rise{from{opacity:0;transform:translateY(${TEXT_RISE_Y}px)}to{opacity:1;transform:translateY(0)}}`,
    /* The wordmark's own: hollow first (not yet written), solid second (inked). */
    '@keyframes hero2-write{from{opacity:0}to{opacity:1}}',
    `${s} .hero2-word{animation:hero2-rise 900ms var(--ease) 120ms both}`,
    `${s} .hero2-hollow{animation:hero2-write 700ms var(--ease) 260ms both}`,
    `${s} .hero2-solid{animation:hero2-write 700ms var(--ease) 440ms both}`,
    `${s} .hero2-strip{animation:hero2-rise 700ms var(--ease) 660ms both}`,
    `${s} .hero2-caption{animation:hero2-rise 700ms var(--ease) 820ms both}`,
    /* Type is never allowed to sit on a busy field: the quiet zone is computed,
     * but the text also carries a hairline of paper behind nothing at all —
     * there is no halo, no shadow, no plate. Legibility comes from the field
     * yielding, not from the type defending itself. */
    fieldCSS(),
  ].join('\n    ');
}

/* ---------------------------------------------------------------- render -- */

/**
 * @param {object} [data]  see the data contract at the top of this file
 * @param {{scheme?: 'light'|null}} [opts]
 * @returns {{svg: string, height: number}}
 */
export function render(data = {}, opts = {}) {
  const m = heroModel(data);
  const cls = rootClass(HERO_SCOPE, opts?.scheme ?? null);

  const stripText = txt({
    x: EDGE + 16, y: STRIP_Y, value: m.facts, fill: 'var(--ink-2)', size: STRIP_SIZE,
    mono: true, ls: '0.14em',
  });

  /* The width the quiet box needs comes from the same estimator the work list
   * uses, so the box follows the copy rather than a guess about it. The
   * freshness date is deliberately NOT a second island up here: at the profile
   * column's 830 px the plate renders 11 units at ~8 px, and the date sat
   * exactly where the cloud is densest, which made it the least readable thing
   * on the artwork. The work list carries it at full size instead, on clean
   * paper, where it can actually be read. */
  const islandW = advWidth(m.facts, STRIP_SIZE, { mono: true, tracking: 0.14 }) + 24;

  const ledeW = advWidth(m.ledeZh, LEDE_SIZE);
  const ledeEnW = advWidth(m.ledeEn, LEDE_EN_SIZE);
  const cjkW = advWidth(m.cjk, CJK_SIZE, { tracking: 0.18 });
  /* A collision here is a copy bug, not a rendering accident: the caption row
   * is the one place two runs share a baseline. Fail loudly instead of letting
   * the positioning line run under the Chinese name. */
  const captionRoom = RIGHT - (EDGE + cjkW) - 48;
  if (Math.max(ledeW, ledeEnW) > captionRoom) {
    throw new Error(
      `hero2: caption row needs ${Math.round(Math.max(ledeW, ledeEnW))} units but only ` +
      `${Math.round(captionRoom)} are free after 守墨 — shorten the copy or raise CJK_SIZE-aware geometry`,
    );
  }

  const boxes = heroQuietBoxes(islandW);
  const field = buildField(boxes);

  const body = [
    /* Plate: paper, full bleed, hard edges. No card, no radius, no shadow —
     * DESIGN.md §1 ② bans the rounded card, and a plate wants its edges. */
    rect({ x: 0, y: 0, w: HERO_W, h: HERO_H, fill: 'var(--paper)' }),
    `<g class="hero2-field" fill="var(--field-ink)" aria-hidden="true">${field.ink}</g>`,
    `<g class="hero2-field" fill="var(--field-acid)" aria-hidden="true">${field.acid}</g>`,

    /* Metadata island, top left. The only small mark on the plate. */
    `<g class="hero2-strip">${diamond(EDGE + 4, STRIP_Y - 4, 4.5, 'var(--acid)')}${stripText}</g>`,

    /* The wordmark. One text run so the font's own kerning holds across the
     * INK|WARD boundary; the two tspans carry the hollow/solid device. */
    `<text${at('class', 'hero2-word display')}${at('x', HERO_W / 2)}${at('y', DISPLAY_Y)}` +
    `${at('font-size', DISPLAY_SIZE)} text-anchor="middle"${at('textLength', DISPLAY_ADVANCE)}` +
    ` lengthAdjust="spacingAndGlyphs"${at('letter-spacing', '-0.03em')}>` +
    `<tspan${at('class', 'hero2-hollow')} fill="none"${at('stroke', 'var(--ink)')}` +
    `${at('stroke-width', n(0.022 * DISPLAY_SIZE))}>INK</tspan>` +
    `<tspan${at('class', 'hero2-solid')}>WARD</tspan></text>`,

    /* Caption row: the Chinese name on the left, the positioning pair on the
     * right, sharing one baseline. */
    `<g class="hero2-caption">` +
    txt({ x: EDGE, y: CJK_Y, value: m.cjk, fill: 'var(--ink)', size: CJK_SIZE, cjk: true, ls: '0.18em', weight: 700 }) +
    /* The Chinese positioning line IS the sentence that says what this is, so it
     * takes full ink. It was --ink-2 and read as barely legible at 15 units. The
     * 12-unit English counterpart stays subordinate on --ink-2, which is its
     * correct role rather than a contrast problem. */
    txt({ x: RIGHT, y: CJK_Y - 18, value: m.ledeZh, fill: 'var(--ink)', size: LEDE_SIZE, anchor: 'end' }) +
    txt({ x: RIGHT, y: CJK_Y, value: m.ledeEn, fill: 'var(--ink-2)', size: LEDE_EN_SIZE, anchor: 'end' }) +
    `</g>`,

    /* The plate's edge — a boundary, which is a stroke that carries meaning. */
    rect({ x: 0.5, y: 0.5, w: HERO_W - 1, h: HERO_H - 1, fill: 'none', stroke: 'var(--rule)', sw: 1 }),
  ].filter(Boolean).join('\n  ');

  const style = [
    styleBlock({ scope: HERO_SCOPE }),
    `<style>\n    ${paletteCSS(HERO_SCOPE)}\n` +
    `    .${HERO_SCOPE} .display{font-family:'Archivo Black','Arial Black','Helvetica Neue',Arial,system-ui,sans-serif;font-weight:900}\n` +
    `    .${HERO_SCOPE} .cjk{font-family:'PingFang SC','Hiragino Sans GB','Microsoft YaHei','Noto Sans CJK SC','Source Han Sans SC',system-ui,sans-serif}\n` +
    `    .${HERO_SCOPE} .mono{font-family:${'ui-monospace, \'SF Mono\', \'JetBrains Mono\', \'Cascadia Code\', Consolas, \'Liberation Mono\', monospace'}}\n` +
    `    .${HERO_SCOPE} .hero2-hollow{fill:transparent;-webkit-text-stroke:.022em var(--ink);text-stroke:.022em var(--ink)}\n` +
    `    .${HERO_SCOPE} .hero2-solid{fill:var(--ink)}\n` +
    `    .${HERO_SCOPE} .hero2-word{fill:var(--ink)}\n` +
    `    ${heroMotionCSS()}\n  </style>`,
  ].join('\n  ');

  const svg = svgRoot({
    w: HERO_W,
    h: HERO_H,
    title: m.title,
    desc: m.desc,
    cls,
    children: `${style}\n  ${body}`,
  });

  return { svg, height: HERO_H, field: field.report };
}

/* ============================================================ work list ==== */

const WORK_SCOPE = 'work';
const W_PAD = PAD;               // 28
const W_EDGE = 32;               // matches the hero plate's padding
const W_RIGHT = FRAME_W - W_EDGE;
const W_HEAD_Y = 44;             // eyebrow baseline
const W_RULE_Y = 60;             // header hairline
const W_ROW_H = 64;
const W_BOTTOM = 28;
const W_NAME_SIZE = 17;
const W_DESC_SIZE = 14;
const W_META_SIZE = 11;
const W_INDEX_SIZE = 11;
const W_COL_X = W_EDGE + 44;     // 76 — index column is 44 wide

/** Where the right-hand meta columns sit. */
const W_ARROW_X = W_RIGHT - 20;  // left edge of the 20-unit arrow box
const W_LANG_RIGHT = W_RIGHT - 150;
const W_STAR_RIGHT = W_RIGHT - 34;

/** The byte-comparison sort: deterministic everywhere, unlike localeCompare. */
function cmp(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Repository rows, ordered by the only rule that keeps meaning as the account
 * grows: the featured repo first, then most-starred, then most recently pushed,
 * then name. Adding a repo to stats.json changes nothing here.
 *
 * `<login>/<login>` is held back by default: it is a real public repo, but it is
 * only the container for the profile README, it has no description to print, and
 * spending a row on it would push the actual work down. The header pays for it
 * honestly — it says "1 OF 2 PUBLIC REPOS" instead of quietly under-counting —
 * so the artwork never claims a number it cannot show. Set this to `false` to
 * list every public repo.
 */
const HIDE_PROFILE_REPO = true;

export function repoRows(data) {
  const d = data ?? {};
  const login = String(d.user?.login ?? d.login ?? '').toLowerCase();
  const repos = (Array.isArray(d.repos) ? d.repos : [])
    .filter(Boolean)
    .filter((r) => !(HIDE_PROFILE_REPO && login && String(r.name ?? '').toLowerCase() === login));
  const featuredName = d.featured?.name ?? null;
  return [...repos].sort((a, b) => {
    const fa = a.name === featuredName ? 1 : 0;
    const fb = b.name === featuredName ? 1 : 0;
    if (fa !== fb) return fb - fa;
    const sa = Number(a.stars) || 0;
    const sb = Number(b.stars) || 0;
    if (sa !== sb) return sb - sa;
    const pa = String(a.pushedAt ?? '');
    const pb = String(b.pushedAt ?? '');
    if (pa !== pb) return cmp(pb, pa);
    return cmp(String(a.name ?? ''), String(b.name ?? ''));
  });
}

/* -------------------------------------------------------------- markdown -- */

/** Escape a value for a Markdown text position. */
function mdText(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/([\\`*_[\]|])/g, '\\$1');
}

/** URLs keep their meaning only if the parentheses survive; wrap the odd ones. */
function mdUrl(u) {
  const s = String(u);
  return /[\s()<>]/.test(s) ? `<${s}>` : s;
}

/**
 * The links that sit UNDER the artwork in the README.
 *
 * The artwork cannot be clicked — GitHub serves it through an <img>, where no
 * script or binding can run — so every row is duplicated here as a real link.
 * This is not a fallback: the `01`/`02` indices, the ↗ and the metadata order
 * are the SVG's own, so the two read as one list set twice (once drawn, once
 * as text). The Markdown also carries the description in full, where the SVG
 * has to fit one line.
 */
export function markdown(data = {}) {
  const rows = repoRows(data);
  if (!rows.length) {
    const login = String(data?.user?.login ?? data?.login ?? '3332210');
    return `_No public repositories yet — see [github.com/${mdText(login)}](https://github.com/${login})._\n`;
  }
  const items = rows.map((r, i) => {
    const idx = String(i + 1).padStart(2, '0');
    const name = String(r.name ?? '');
    const url = String(r.htmlUrl ?? `https://github.com/${data?.user?.login ?? ''}/${name}`);
    const desc = String(r.description ?? '').trim();
    const lang = r.language ? mdText(up(r.language)) : null;
    const stars = Number(r.stars) || 0;
    const meta = [lang, `★ ${stars}`].filter(Boolean).join(' · ');
    const body = desc ? mdText(desc) : '_no description_';
    return `\`${idx}\` · **[${mdText(name)} ↗](${mdUrl(url)})** — ${body} · ${meta}`;
  });
  return items.join('\n\n') + '\n';
}

/* ---------------------------------------------------------------- render -- */

/**
 * @param {object} [data]  same data contract as `render`
 * @param {{scheme?: 'light'|null}} [opts]
 * @returns {{svg: string, height: number}}
 */
export function renderWork(data = {}, opts = {}) {
  const cls = rootClass(WORK_SCOPE, opts?.scheme ?? null);
  const rows = repoRows(data);
  const updateIso = typeof data?.generatedAt === 'string' ? data.generatedAt.slice(0, 10) : null;
  const listed = rows.length;
  const total = Number.isFinite(data?.user?.publicRepos) ? data.user.publicRepos : listed;
  /* The count has to describe the list that is actually drawn. When a repo is
   * held back (`HIDE_PROFILE_REPO`), the header says so instead of printing a
   * total the reader cannot find below it. */
  const repoLabel = total === listed
    ? `${total} PUBLIC ${total === 1 ? 'REPO' : 'REPOS'}`
    : `${listed} OF ${total} PUBLIC REPOS`;

  const body = [];

  /* Header: the section eyebrow, the count, and the refresh date. The hairline
   * under it is the list's top rule — a boundary, not an ornament. */
  const eyebrow = `作品 · WORK`;
  body.push(diamond(W_EDGE + 4, W_HEAD_Y - 4, 4.5, 'var(--acid)'));
  body.push(txt({
    x: W_EDGE + 16, y: W_HEAD_Y, value: eyebrow, fill: 'var(--ink-2)', size: W_META_SIZE,
    mono: true, ls: '0.14em',
  }));
  body.push(txt({
    x: W_RIGHT, y: W_HEAD_Y, anchor: 'end', size: W_META_SIZE, mono: true, ls: '0.14em',
    fill: 'var(--ink-2)',
    value: [
      updateIso ? `UPDATED ${updateIso}` : null,
      repoLabel,
    ].filter(Boolean).join(' · '),
  }));
  body.push(hairline(W_EDGE, W_RULE_Y, W_RIGHT));

  const metaBudget = W_LANG_RIGHT - W_COL_X - 24;
  const descBudget = W_STAR_RIGHT - 14 - W_COL_X;

  if (!rows.length) {
    /* Zero state. It must read as deliberate: the rule is drawn, the slot is
     * taken, and the sentence says why it is empty. */
    const y = W_RULE_Y + 40;
    body.push(`<g class="work-row">${txt({
      x: W_COL_X, y, value: 'No public repositories yet.', fill: 'var(--ink-2)', size: W_DESC_SIZE,
    })}${arrow(W_ARROW_X, y + 6, 20)}</g>`);
    body.push(hairline(W_EDGE, W_RULE_Y + W_ROW_H, W_RIGHT));
  }

  rows.forEach((r, i) => {
    const top = W_RULE_Y + i * W_ROW_H;
    const idx = String(i + 1).padStart(2, '0');
    const name = truncate(String(r.name ?? ''), metaBudget, W_NAME_SIZE, { mono: true });
    const desc = String(r.description ?? '').trim();
    /* A repo without a description must not leave a hole where a sentence
     * should be: the slot is filled with an explicit zero-state that is the
     * same size as the real thing. */
    const descText = desc
      ? truncate(desc, descBudget, W_DESC_SIZE)
      : '— no description';
    const lang = r.language ? up(String(r.language)) : null;
    const stars = Number(r.stars) || 0;
    const featured = i === 0;
    const title = [
      `${idx} · ${String(r.name ?? '')}`,
      desc || 'no description',
      [lang, `${stars} ${stars === 1 ? 'star' : 'stars'}`].filter(Boolean).join(' · '),
    ].join(' — ');

    body.push(`<g class="work-row${featured ? ' work-row-lead' : ''}">` +
      (featured ? roundedRect({ x: 16, y: top + 17, w: 2, h: 30, r: 1, fill: 'var(--acid)' }) : '') +
      `<title>${esc(title)}</title>` +
      txt({ x: W_EDGE, y: top + 27, value: idx, fill: 'var(--ink-2)', size: W_INDEX_SIZE, mono: true, ls: '0.1em' }) +
      txt({ x: W_COL_X, y: top + 27, value: name, fill: 'var(--ink)', size: W_NAME_SIZE, mono: true, ls: '-0.02em', cls: 'work-name' }) +
      txt({
        x: W_LANG_RIGHT, y: top + 27, value: lang ?? '—', fill: 'var(--ink-2)', size: W_META_SIZE,
        mono: true, ls: '0.12em', anchor: 'end',
      }) +
      star(W_STAR_RIGHT - advWidth(String(stars), W_META_SIZE, { mono: true }) - 9, top + 22, 5.4, 'var(--ink-2)') +
      txt({
        x: W_STAR_RIGHT, y: top + 27, value: String(stars), fill: 'var(--ink-2)', size: W_META_SIZE,
        mono: true, anchor: 'end',
      }) +
      txt({ x: W_COL_X, y: top + 51, value: descText, fill: 'var(--ink-2)', size: W_DESC_SIZE }) +
      arrow(W_ARROW_X, top + 36, 20) +
      `</g>`);
    body.push(hairline(W_EDGE, top + W_ROW_H, W_RIGHT));
  });

  const height = W_RULE_Y + Math.max(1, rows.length) * W_ROW_H + W_BOTTOM;

  const descOut = rows.length
    ? rows.map((r, i) => {
      const lang = r.language ? up(String(r.language)) : '—';
      const stars = Number(r.stars) || 0;
      const d = String(r.description ?? '').trim();
      return `${String(i + 1).padStart(2, '0')} ${String(r.name ?? '')}：${d || '无描述'}（${lang}，${stars} ★）`;
    }).join('；')
    : '目前没有公开仓库。';

  const style = [
    styleBlock({ scope: WORK_SCOPE }),
    `<style>\n    ${paletteCSS(WORK_SCOPE)}\n` +
    `    .${WORK_SCOPE} .mono{font-family:${'ui-monospace, \'SF Mono\', \'JetBrains Mono\', \'Cascadia Code\', Consolas, \'Liberation Mono\', monospace'}}\n` +
    /* Hover is a hint, never a show: the row's name is the only thing that
     * changes, and the resting state is already complete. (Inside an <img> the
     * pointer may never reach the document; this is an enhancement, never a
     * dependency — the links below the artwork are the interaction.) */
    `    .${WORK_SCOPE} .work-name{transition:fill 280ms var(--ease)}\n` +
    `    .${WORK_SCOPE} .work-row:hover .work-name{fill:var(--acid)}\n` +
    `  </style>`,
  ].join('\n  ');

  const svg = svgRoot({
    w: FRAME_W,
    h: height,
    title: `作品 · WORK — ${String(data?.user?.login ?? '3332210')} 的公开仓库`,
    desc: `${descOut} 每一行在 README 中都有对应的可点击链接。`,
    cls,
    children: `${style}\n  ${rect({ x: 0, y: 0, w: FRAME_W, h: height, fill: 'var(--paper)' })}\n  ` +
      `${body.join('\n  ')}\n  ` +
      `${rect({ x: 0.5, y: 0.5, w: FRAME_W - 1, h: height - 1, fill: 'none', stroke: 'var(--rule)', sw: 1 })}`,
  });

  return { svg, height, rows: rows.length };
}

/* ========================================================== diagnostics ==== */

/** The numbers the build log prints — evidence that the field is calibrated. */
export function diagnostics(data = {}) {
  const m = heroModel(data);
  const islandW = advWidth(m.facts, STRIP_SIZE, { mono: true, tracking: 0.14 }) + 24;
  const boxes = heroQuietBoxes(islandW);
  const field = buildField(boxes);
  const rows = repoRows(data);
  return {
    field: field.report,
    hero: {
      displaySize: DISPLAY_SIZE,
      displayAdvance: DISPLAY_ADVANCE,
      capTop: Number(DISPLAY_CAP_TOP.toFixed(1)),
      quietBoxes: boxes.map((b) => ({
        x0: b.x0, y0: Number(b.y0.toFixed(1)), x1: b.x1, y1: b.y1,
        floor: b.floor, feather: b.feather,
      })),
    },
    work: { rows: rows.length, height: W_RULE_Y + Math.max(1, rows.length) * W_ROW_H + W_BOTTOM },
  };
}

export default { render, renderWork, markdown, diagnostics, repoRows };
