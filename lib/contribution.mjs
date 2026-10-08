/**
 * activity — 1100 x 188. A bespoke "activity + languages" panel.
 *
 *   LEFT  (~59%)  a 30-day activity strip: one bar per day, an axis rule, four
 *                 date ticks, and a meta line of exact counts.
 *   RIGHT (~30%)  the language mix as ONE horizontal stacked bar + a legend.
 *
 * Not a third-party widget: every position below is computed, every colour comes
 * from tokens.mjs, and the shape of the drawing follows the shape of the data.
 *
 * WHY A 30-DAY WINDOW AND NOT A 371-CELL YEAR HEATMAP
 *   The real account has 4 contributions on 2 days out of the last 371 days. A
 *   full-year heatmap would be 369 empty squares; an empty grid cannot be made
 *   beautiful by styling, and dressing it up would be dishonest. A 30-day strip
 *   is the honest window that still shows the true shape of the data — mostly
 *   flat, one busy day — and it degrades to a calm, deliberate zero-state when
 *   the window is empty.
 *
 * SCALE — square root, and why
 *   Bar height is h = plotH * sqrt(count) / sqrt(maxCount).
 *   A max/linear scale flattens every non-peak day into invisibility when one
 *   day is an outlier: count 1 against count 999 is 0.1% of the height, i.e.
 *   sub-pixel. sqrt gives that same day 3.2% of the height (~3.3 user units,
 *   above our 1.5-unit floor), so small activity stays visible and legible while
 *   the outlier still reads unmistakably as the peak. The precise peak is stated
 *   in the meta line, so the compressed axis is never ambiguous.
 *
 * THEME (build contract, design-system §6)
 *   `render(data)` produces the shipped asset. `render(data, { scheme:'light' })`
 *   adds the `activity-light` root class, which wins on specificity alone — that
 *   is how light mode is screenshotted deterministically.
 *
 * DETERMINISM: no Date.now(), no Math.random(), no locale calls. Same input =>
 * byte-identical output. Zero dependencies, pure ESM, Node 20+.
 */

import { FRAME_W, PAD, UNIT, styleBlock, rootClass, esc, THEMES } from '../tokens.mjs';

/* ------------------------------------------------------------------- canvas */

const W = FRAME_W; // 1100
const H = 188;
const PAD_R = W - PAD; // 1072 — right content edge

/* Vertical rhythm. One label row, one plot band, one tick row, one meta row. */
const LABEL_Y = 30; // baseline of both section labels
const PLOT_TOP = 48; // first renderable row of the plot band
const AXIS_Y = 152; // the axis rule; every mark is anchored to it
const TICK_Y = 158; // baseline of the date ticks — 6u below the axis, so the
//                     text clears the rule (ascent ~8u, so it was colliding)
const META_Y = 176; // baseline of the meta line — leaves the ink clear of the
//                     frame edge (cap height ~8u, so ~12u of breathing room)
const PLOT_H = AXIS_Y - PLOT_TOP; // 104

/* Activity columns — computed, never eyeballed. 30 columns tile the strip with
 * no accumulated drift: column i starts at STRIP_X + i * PITCH, and the last
 * column ends exactly on the right content edge. */
const STRIP_X = PAD;
const STRIP_W = 640; // the activity column is bounded, not merely "the rest"
const DAYS = 30;
const PITCH = STRIP_W / DAYS; // 21.333... — identical for every column
/* Each column owns its cell; the visible mark is inset by a constant 1.6 user
 * units, so runs of consecutive non-zero days stay legible as separate days
 * instead of merging into one block. The inset is constant, so the tiling is
 * still computed rather than eyeballed, and the inset hit rect keeps the full
 * 21.33-unit target (well above the 11-unit floor).
 * Bars are square-cornered because a radius would cut a notch wherever two
 * neighbouring bars sit at similar heights; the language bar on the right
 * carries the radius language instead. */
const MARK_INSET = 1.6;
const BAR_W = PITCH - MARK_INSET;
const AXIS_W = STRIP_W; // the axis spans exactly the same box as the columns

/* The column separator. This is the gutter that keeps the language block from
 * crowding the activity strip: nothing is drawn inside it. */
const SEP_X = 712;

/* Right panel. The percentages get a real gutter: the bar stops at BAR_RIGHT and
 * the value column is right-aligned to the frame edge inside its own 56 units. */
const PANEL_X = 748;
const BAR_RIGHT = 1016; // bar ends here; 1016..1072 is the value gutter
const PANEL_W = BAR_RIGHT - PANEL_X; // 268
const PCT_X = PAD_R; // right-aligned value column
const LANG_BAR_Y = 72;
const LANG_BAR_H = 24;
const LEGEND_Y = 120; // baseline of the first legend row
const LEGEND_GAP = 22;

/* Marks. */
const MIN_BAR_H = 1.5; // a non-zero day is never invisible
const RAIL_H = 1.5; // resting mark for a zero day
/* At or above this height the count label moves inside the bar (see render()). */
const COUNT_INSIDE_MIN = 30;
const TIP_W = 196; // fixed tooltip width => its x is clamped by construction
const TIP_H = 24; // one compact line: the exact date, and the exact count
/* The tooltip band: a fixed strip just BELOW the axis rule.
 *
 * This is the only band in a 188-unit frame where a tip covers neither the bars
 * (the data) nor a section label. It overlaps the date-tick row and the edge of
 * the meta row for as long as the pointer rests on a column, which is exactly
 * what a tooltip is for. Fixed geometry means a tip can never overflow the
 * frame, and x is clamped into the content box, so it can never leave it either. */
const TIP_Y = AXIS_Y + 5;
/* Where the section labels are centred: inset from each content edge by half a
 * tooltip width, so the edge-clamped tooltips never cover them. */
const LEFT_LABEL_X = PAD + TIP_W / 2;
const RIGHT_LABEL_X = PAD_R - TIP_W / 2;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* ------------------------------------------------------------------ helpers */

function num(v, fallback = 0) {
  const k = Number(v);
  return Number.isFinite(k) ? k : fallback;
}
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Trim a float to at most 4 decimals, dropping trailing zeros. Four decimals
 * keeps column positions exact enough that the 30 columns tile with no drift at
 * all (accumulated error < 0.001 user units), while still producing tidy output.
 */
function n(v) {
  const r = Math.round(Number(v) * 10000) / 10000;
  return String(r);
}

/** XML escaping for values interpolated into text nodes and attributes. */
function escXml(s) {
  return esc(s);
}

/**
 * Rect builder. Always emits BOTH rx and ry — some rasterizers (and GitHub's
 * image proxy) render rx-only rects with sharp corners. `title` becomes a
 * <title> child, which is the native tooltip and also the accessible name.
 *
 * Pass `fill: null` to omit the attribute entirely and let the stylesheet own the
 * paint (needed for anything themed through a CSS variable).
 */
function rect({ x, y, w, h, r = 0, fill = null, stroke = null, sw = 1, cls = '', title = null, extra = '' }) {
  const fillAttr = fill === null ? '' : ` fill="${fill}"`;
  const strokeAttrs = stroke ? ` stroke="${stroke}" stroke-width="${sw}"` : '';
  const rAttrs = r > 0 ? ` rx="${n(r)}" ry="${n(r)}"` : '';
  return (
    `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}"${rAttrs}${fillAttr}${strokeAttrs}` +
    `${cls ? ` class="${cls}"` : ''}${extra ? ' ' + extra : ''}>` +
    `${title ? `<title>${escXml(title)}</title>` : ''}</rect>`
  );
}

/** Hairline rule on the horizontal. */
function rule({ x, y, w, stroke = 'var(--line)', sw = 1, cls = '' }) {
  return `<line x1="${n(x)}" y1="${n(y)}" x2="${n(x + w)}" y2="${n(y)}" stroke="${stroke}" stroke-width="${sw}"${cls ? ` class="${cls}"` : ''}/>`;
}

/** Section eyebrow: uppercase, tracked, tertiary. Never below the 11-unit floor. */
function label({ x, y, text, size = 11, anchor = 'start', cls = '' }) {
  return `<text x="${n(x)}" y="${n(y)}" fill="var(--text3)" font-size="${size}" font-weight="500" letter-spacing="0.9" text-anchor="${anchor}" class="${cls}">${escXml(String(text).toUpperCase())}</text>`;
}

/** Text node with explicit typographic control. */
function svgText({ x, y, value, fill = 'var(--text1)', size = 11, weight = 400, anchor = 'start', ls = null, cls = '' }) {
  const attrs = [
    `x="${n(x)}"`,
    `y="${n(y)}"`,
    `fill="${fill}"`,
    `font-size="${size}"`,
    weight !== 400 ? `font-weight="${weight}"` : '',
    anchor !== 'start' ? `text-anchor="${anchor}"` : '',
    ls !== null ? `letter-spacing="${ls}"` : '',
    cls ? `class="${cls}"` : '',
  ].filter(Boolean).join(' ');
  return `<text ${attrs}>${escXml(value)}</text>`;
}

/** Day number from 'YYYY-MM-DD' (UTC, so it is timezone-independent), or null. */
function dayNumber(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''));
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(t) ? t : null;
}

/** Day number -> 'YYYY-MM-DD' (UTC). */
function isoFromDayNumber(t) {
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** 'YYYY-MM-DD' -> '02 Oct'. No locale calls: output must be byte-stable. */
function shortDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''));
  if (!m) return '';
  return `${m[3]} ${MONTHS[Number(m[2]) - 1] ?? m[2]}`;
}

/** '85.4%' — one decimal, '.0' trimmed, never locale-formatted. */
function pctLabel(p) {
  const v = Math.round(num(p) * 10) / 10;
  return `${Number.isInteger(v) ? v : v.toFixed(1)}%`;
}

/**
 * Bar height on the square-root scale (see the SCALE note at the top).
 * count <= 0 => 0, and the caller draws the resting rail instead.
 */
function barHeight(count, maxCount) {
  if (count <= 0) return 0;
  if (maxCount <= 0) return MIN_BAR_H;
  return clamp((PLOT_H * Math.sqrt(count)) / Math.sqrt(maxCount), MIN_BAR_H, PLOT_H);
}

/**
 * Four evenly spread tick indices across the strip.
 *
 * The first and last ticks are pulled one whole column inward. A date label
 * ("04 Sep") is wider than a single 21.3-unit column, so a tick sitting on the
 * outermost column would push its centred text past the frame edge. Insetting by
 * a full column keeps every label centred, inside the strip, with no clamping
 * and no anchor special-cases.
 */
function tickIndices(count) {
  if (count <= 0) return [];
  if (count <= 4) return [...Array(count).keys()];
  if (count < 6) return [0, count - 1];
  const lo = 1;
  const hi = count - 2;
  const out = [lo];
  for (let k = 1; k <= 2; k++) out.push(lo + Math.round(((hi - lo) * k) / 3));
  out.push(hi);
  return out;
}

/** Longest run of consecutive days with count > 0 (list is oldest-first). */
function longestRun(days) {
  let best = 0;
  let run = 0;
  for (const a of days) {
    run = a.count > 0 ? run + 1 : 0;
    if (run > best) best = run;
  }
  return best;
}

/* ------------------------------------------------------------------ normalize */

/**
 * Accept BOTH the documented task contract and the real `data/stats.json`, and
 * return one canonical shape. Nothing here may throw: a partial payload still
 * has to yield a complete, honest asset.
 *
 * data/stats.json: { activity: { window, series[30], summary, yearTotal, yearStreak,
 *                                calendar[371] },
 *                    languages: [{name,bytes,pct}], totals: {stars,...}, repos: [] }
 * task contract:   { window, activity:[{date,count}], summary, languages, totals }
 */
function normalize(data) {
  const d = data && typeof data === 'object' ? data : {};
  const actObj = d.activity && !Array.isArray(d.activity) && typeof d.activity === 'object' ? d.activity : {};
  const contrib = d.contribution && typeof d.contribution === 'object' ? d.contribution : {};

  /* ---- raw day list, oldest first ---- */
  let rawDays = [];
  if (Array.isArray(d.activity)) rawDays = d.activity;
  else if (Array.isArray(actObj.series)) rawDays = actObj.series; // stats.json
  else if (Array.isArray(contrib.days)) rawDays = contrib.days;
  else if (Array.isArray(d.days)) rawDays = d.days;

  const allDays = rawDays
    .map((a) => ({
      date: typeof a?.date === 'string' ? a.date : '',
      count: Math.max(0, num(a?.count, 0)),
    }))
    .filter((a) => dayNumber(a.date) !== null);

  /* ---- the window end: explicit, else the newest day. Never the wall clock. ---- */
  const explicitTo =
    (typeof d.window?.to === 'string' && d.window.to) ||
    (typeof actObj.window?.to === 'string' && actObj.window.to) ||
    (typeof contrib.window?.to === 'string' && contrib.window.to) ||
    '';

  let days = [];

  if (explicitTo && dayNumber(explicitTo) !== null) {
    const endT = dayNumber(explicitTo);
    const startT = endT - (DAYS - 1) * 86400000;
    const byDate = new Map(allDays.map((a) => [a.date, a.count]));
    for (let t = startT; t <= endT; t += 86400000) {
      const iso = isoFromDayNumber(t);
      days.push({ date: iso, count: byDate.get(iso) ?? 0 });
    }
  } else if (allDays.length) {
    days = allDays.slice(-DAYS);
  }

  /* A short window is padded at the front so the strip is always 30 columns. */
  while (days.length > 0 && days.length < DAYS) {
    const firstT = dayNumber(days[0].date);
    days.unshift({ date: isoFromDayNumber(firstT - 86400000), count: 0 });
  }

  const from = days[0]?.date ?? '';
  const to = days[days.length - 1]?.date ?? '';

  /* ---- summary: window-scoped when the payload provides one ---- */
  const derivedTotal = days.reduce((acc, a) => acc + a.count, 0);
  const derivedActive = days.filter((a) => a.count > 0).length;
  const s = d.summary && typeof d.summary === 'object' ? d.summary : actObj.summary ?? {};
  const contributions = Math.max(0, num(s.contributions, derivedTotal));
  const activeDays = Math.max(0, num(s.activeDays, derivedActive));
  const longestStreak = Math.max(
    0,
    num(s.longestStreak, num(contrib.streak?.longest, num(actObj.yearStreak, longestRun(days)))),
  );

  /* ---- account-wide figures: the year, not just the window ---- */
  const yearTotal = Math.max(0, num(d.totals?.contributions, num(actObj.yearTotal, contributions)));
  const reposArr = Array.isArray(d.repos) ? d.repos : [];

  /* ---- languages ---- */
  const t = d.totals && typeof d.totals === 'object' ? d.totals : {};
  const rawLangs = Array.isArray(d.languages) ? d.languages : Array.isArray(t.languages) ? t.languages : [];
  const languages = rawLangs
    .map((l) => ({
      name: typeof l?.name === 'string' && l.name ? l.name : 'Unknown',
      bytes: Math.max(0, num(l?.bytes, 0)),
      pct: Math.max(0, num(l?.pct, 0)),
    }))
    .filter((l) => l.pct > 0 || l.bytes > 0)
    .sort((a, b) => b.pct - a.pct || b.bytes - a.bytes);

  if (languages.length && !languages.some((l) => l.pct > 0)) {
    const tot = languages.reduce((acc, l) => acc + l.bytes, 0) || 1;
    for (const l of languages) l.pct = (l.bytes / tot) * 100;
  }
  const pctSum = languages.reduce((acc, l) => acc + l.pct, 0) || 1;

  return {
    days,
    from,
    to,
    daysCount: days.length || DAYS,
    contributions,
    activeDays,
    longestStreak,
    yearTotal,
    repos: Math.max(0, num(d.totals?.repos, num(t.repos, num(t.publicRepos, reposArr.length)))),
    stars: Math.max(0, num(t.stars, 0)),
    /* Normalised to exactly 100 so stacked segments always close the bar. */
    languages: languages.map((l) => ({ ...l, pct: (l.pct / pctSum) * 100 })),
    maxCount: days.reduce((m, a) => Math.max(m, a.count), 0),
  };
}

/* --------------------------------------------------------------------- style */

/**
 * Asset-scoped CSS. Token values come from styleBlock(); this adds only the
 * rules specific to the activity drawing.
 *
 * Token variables are spelled without hyphens between the word and the index
 * (`--bg1`, `--text3`) — that is what tokens.kebab() emits, and primitives.mjs
 * uses the same names.
 */
/**
 * Token declarations for a theme, in the same kebab spelling tokens.kebab()
 * emits. Derived from tokens.mjs — this file never invents a colour value.
 */
function themeVars(mode) {
  return Object.entries(THEMES[mode] ?? {})
    .map(([k, v]) => `--${k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}:${v};`)
    .join('');
}

function assetCss(columnCount = 0) {
  /* One hover rule per column, because the hit target is a following sibling of
   * the marks it lights up (see the emission-order note in render()). `:has()`
   * is evaluated from the root, so the hover state works no matter which
   * element the pointer actually resolves to. */
  const hoverRules = [];
  for (let i = 0; i < columnCount; i++) {
    const marks = `.activity:has(#activity-hit-${i}:hover) #activity-marks-${i}`;
    const tip = `.activity:has(#activity-hit-${i}:hover) #activity-tips #activity-tip-${i}`;
    hoverRules.push(
      `${marks} .activity-bar{fill-opacity:1;stroke-opacity:1}`,
      `${marks} .activity-ring{opacity:1}`,
      /* The tips live in their own layer at the end of the document (so they
       * paint above the meta row), hence the different path here. */
      `${tip}{opacity:1;visibility:visible;transform:translateY(0)}`,
    );
  }

  return `<style>
    /* Forced-dark variant of the design-system rule. Same mechanism as
     * .activity-light.activity: a pure specificity win, so dark art can be
     * verified on a machine whose OS prefers light. The shipped asset is still
     * the plain .activity render. */
    .activity-dark.activity{${themeVars('dark')}}
    .activity-bg{fill:var(--bg0)}
    .activity-axis{stroke:var(--line-strong);stroke-width:1}
    .activity-hair{stroke:var(--line);stroke-width:1}
    .activity-sep{stroke:var(--line);stroke-width:1}
    .activity-lbl{fill:var(--text3);font-size:11px;font-weight:500;letter-spacing:0.06em}
    .activity-meta{fill:var(--text3);font-size:11px;font-weight:500}
    .activity-count{fill:var(--text2);font-size:12px;font-weight:600}
    /* A zero day keeps a resting rail, so the axis reads as measured, not broken. */
    .activity-rail{fill:var(--bg2);stroke:var(--line-strong);stroke-width:1;stroke-opacity:0.9}
    /* Everything inside a column group is a decoy: the transparent hit rect that
     * follows it owns the pointer. */
    .activity-marks{pointer-events:none}
    .activity-bar{fill:var(--accent);fill-opacity:0.75;stroke:var(--accent);stroke-width:1;stroke-opacity:0.4;transition:fill-opacity 180ms cubic-bezier(0.22,1,0.36,1),stroke-opacity 180ms cubic-bezier(0.22,1,0.36,1)}
    .activity-ring{fill:none;stroke:var(--accent);stroke-width:1;stroke-opacity:0.9;opacity:0;transition:opacity 180ms cubic-bezier(0.22,1,0.36,1)}
    /* Hover: raise the alpha, add the 1px outline, reveal this column's tip. */
${hoverRules.map((r) => '    ' + r).join('\n')}
    /* The tip layer. Position and target are set in CSS only — never by JS. */
    .activity-tip{opacity:0;visibility:hidden;transform:translateY(3px);transition:opacity 180ms cubic-bezier(0.22,1,0.36,1),transform 180ms cubic-bezier(0.22,1,0.36,1),visibility 0s linear 180ms}
    /* The tip box is OPAQUE (fill:var(--bg1), the raised-panel token from the
     * design system). A stroke-only box lets the meta row show through the tip
     * text and makes the whole thing illegible. */
    .activity-tip-box{fill:var(--bg1);stroke:var(--line-strong);stroke-width:1}
    .activity-tip-date{fill:var(--text3);font-size:11px;font-weight:500;letter-spacing:0.06em}
    .activity-tip-rule{stroke:var(--line);stroke-width:1}
    .activity-tip-count{fill:var(--text1);font-size:13px;font-weight:600}
    .activity-tip-rule{stroke:var(--line);stroke-width:1}
    .activity-langname{fill:var(--text1);font-size:12px;font-weight:600}
    .activity-langpct{fill:var(--text2);font-size:12px;font-weight:400}
    @media (prefers-reduced-motion: reduce){
      .activity-bar,.activity-ring,.activity-tip{transition:none}
      .activity-tip{transform:none}
    }
  </style>`;
}

/* -------------------------------------------------------------------- render */

/**
 * @param {object} data   task contract or data/stats.json (both accepted)
 * @param {object} [opts] { scheme: 'light' } forces the light theme
 * @returns {{ svg: string }}
 */
export function render(data, opts = {}) {
  const d = normalize(data);
  const scope = 'activity';
  /* design-system §6: no opts => the shipped asset; opts.scheme 'light' adds the
   * forced-light class that wins on specificity. We additionally support
   * 'dark', because plain `.activity` still defers to the host's
   * prefers-color-scheme — on a light-preferring machine there would otherwise be
   * no way to render or screenshot the dark art deterministically.
   *
   * Single-theme mode (opts.theme) carries the BARE scope instead: the file
   * itself is one theme, so a -dark/-light class would be a switch that
   * switches nothing. */
  const cls = opts?.theme
    ? String(scope).trim()
    : (opts?.scheme === 'dark' ? `${scope} ${scope}-dark` : rootClass(scope, opts?.scheme));
  const zero = d.contributions === 0 && d.activeDays === 0;
  const body = [];

  /* Background: the asset carries its own themed background, so it renders
   * identically inside an <img> and in a raw document. */
  body.push(`<rect class="activity-bg" x="0" y="0" width="${W}" height="${H}"/>`);

  /* ---------------------------------------------------- left: activity strip */
  const leftLabel = zero
    ? `No contributions \u00b7 last ${d.daysCount} days`
    : `Contributions \u00b7 ${shortDate(d.from)} \u2013 ${shortDate(d.to)} \u00b7 last ${d.daysCount} days`;
  body.push(
    label({ x: PAD, y: LABEL_Y, text: leftLabel, size: 11, anchor: 'start', cls: 'activity-lbl' }),
  );

  /* Axis rule: every mark is anchored to it, so a zero day has a visible
   * resting place instead of simply not existing. */
  body.push(rule({ x: STRIP_X, y: AXIS_Y, w: AXIS_W, stroke: 'var(--line-strong)', cls: 'activity-axis' }));

  /* The zero-state is a statement, not an error: the axis, the tick marks and
   * the date row all stay exactly where they are in the active state, and the
   * region gets the same composed annotation a sparse window gets. */
  if (zero) {
    body.push(
      svgText({
        x: STRIP_X + 8, y: PLOT_TOP + 52, value: 'Nothing recorded in this window yet \u2014 a clean slate.',
        fill: 'var(--text3)', size: 11, cls: 'activity-meta',
      }),
    );
  }

  /* Ticks: four evenly spread dates, centred on their columns. */
  for (const i of tickIndices(d.days.length)) {
    const a = d.days[i];
    const cx = STRIP_X + i * PITCH + PITCH / 2;
    body.push(`<line class="activity-hair" x1="${n(cx)}" y1="${AXIS_Y}" x2="${n(cx)}" y2="${AXIS_Y + 4}"/>`);
    body.push(
      svgText({
        x: n(cx), y: TICK_Y, value: shortDate(a?.date), fill: 'var(--text3)', size: 11,
        anchor: 'middle', cls: 'activity-meta',
      }),
    );
  }

  /* Columns.
   *
   * Hover here is governed by hit-testing, not just by CSS, and Chromium
   * resolves a hit test to the LAST PAINTED element under the cursor. Two
   * consequences, both verified with a controlled probe matrix:
   *
   *   - An invisible hit rect painted before its own bar never matches :hover
   *     (the bar wins the hit test), so a `~` hover chain silently does nothing.
   *   - A hit rect painted after the bar does receive the pointer — but then it
   *     is no longer a PRECEDING sibling of the marks, so `~` cannot reach them.
   *
   * So each column is emitted as a group of marks followed by the hit rect:
   *
   *     g#activity-marks-i (bar, ring, count, tip)   <- pointer-events:none
   *     rect#activity-hit-i (full column, transparent)
   *
   * and the hover state is driven from the root with one `:has()` rule per
   * column (see assetCss). This needs no JS, keeps a single shared tooltip layer
   * per asset, and makes the whole 21.33 x 104-unit column the hover target
   * (well above the 11-unit floor), including days with no bar at all.
   *
   * The tip groups themselves are hoisted to the very END of the document (see
   * tipLayer below): they must paint above the meta row and the language legend,
   * and a later sibling wins that contest. */
  const rails = [];
  const columns = [];
  const tipLayer = [];

  d.days.forEach((a, i) => {
    const bx = STRIP_X + i * PITCH;
    const h = barHeight(a.count, d.maxCount);
    const noun = a.count === 1 ? 'contribution' : 'contributions';
    const datum = `${a.date || 'unknown date'} \u2014 ${a.count} ${noun}`;

    const marks = [];

    if (h > 0) {
      marks.push(rect({ x: bx, y: AXIS_Y - h, w: BAR_W, h, r: 0, cls: 'activity-bar', title: datum }));
      marks.push(rect({ x: bx, y: AXIS_Y - h, w: BAR_W, h, r: 0, cls: 'activity-ring' }));
      /* A sparse window must read as composed, not as a failed render, so every
       * visible day states its exact count. Placement depends on the bar:
       *   short bar -> the label sits just above it, in the quiet space;
       *   tall bar  -> no room above (the tooltip band owns that strip), so the
       *                label goes INSIDE the bar near its top, in the token text
       *                colour, which reads on the accent fill in both themes. */
      const inside = h >= COUNT_INSIDE_MIN;
      marks.push(
        svgText({
          x: n(bx + BAR_W / 2),
          y: n(inside ? AXIS_Y - h + 14 : AXIS_Y - h - 6),
          value: String(a.count),
          fill: inside ? 'var(--text1)' : 'var(--text2)',
          size: 12, weight: 600, anchor: 'middle', cls: 'activity-count',
        }),
      );
    } else {
      rails.push(rect({ x: bx, y: AXIS_Y - RAIL_H, w: BAR_W, h: RAIL_H, r: 0, cls: 'activity-rail', title: datum }));
    }

    /* The shared tooltip layer: one <g> per column, positioned by construction.
     *
     * The column position is set with the CSS `translate` PROPERTY, not a
     * `transform` attribute, and deliberately so: the hover animation uses
     * `transform: translateY(…)`, and a CSS transform declaration replaces an
     * element's whole transform, including a `transform="translate(x,y)"`
     * attribute. Setting the position via `translate` keeps the two independent,
     * so the animation can never cancel the placement. (Verified: with the
     * attribute form, all 30 tips rendered at the origin.)
     *
     * A 188-unit frame must hold a label row, a 104-unit plot and a meta row, so
     * the tip is one compact line parked in a fixed band just below the axis —
     * the only strip where it covers neither the bars (the data) nor a section
     * label. Fixed y, clamped x: it cannot overflow the frame by construction. */
    const tipX = clamp(bx + BAR_W / 2 - TIP_W / 2, PAD, PAD_R - TIP_W);
    tipLayer.push(
      `<g class="activity-tip" id="activity-tip-${i}" style="translate:${n(tipX)}px ${n(TIP_Y)}px">` +
        rect({ x: 0, y: 0, w: TIP_W, h: TIP_H, r: UNIT, cls: 'activity-tip-box' }) +
        `<text class="activity-tip-date" x="12" y="16">${escXml(a.date || 'unknown')}</text>` +
        `<text class="activity-tip-count" x="${TIP_W - 12}" y="16" text-anchor="end">${escXml(`${a.count} ${noun}`)}</text>` +
        `</g>`,
    );

    /* Marks first (all pointer-events:none), then the hit target last so it wins
     * the hit test for the whole column. */
    columns.push(
      `<g id="activity-marks-${i}" class="activity-marks" aria-hidden="true">${marks.join('')}</g>` +
        rect({
          x: bx, y: PLOT_TOP, w: PITCH, h: PLOT_H, r: 0, fill: 'transparent',
          cls: 'activity-hit', title: datum,
          extra: `id="activity-hit-${i}" pointer-events="all"`,
        }),
    );
  });

  body.push(`<g aria-hidden="true">${rails.join('')}</g>`);
  body.push(columns.join('\n  '));

  /* The gutter between the two columns. Nothing is ever drawn inside it, which
   * is what gives the language block its breathing room. */
  body.push(`<line class="activity-sep" x1="${SEP_X}" y1="${LABEL_Y - 12}" x2="${SEP_X}" y2="${META_Y - 14}"/>`);

  /* -------------------------------------------------- right: language mix */
  body.push(
    label({
      x: PAD_R, y: LABEL_Y, text: d.languages.length ? 'Languages \u00b7 by bytes' : 'Languages',
      size: 11, anchor: 'end', cls: 'activity-lbl',
    }),
  );

  if (d.languages.length) {
    /* One stacked bar. The first and last segments carry the outer radii, so the
     * assembly reads as a single bar; inner segments stay square so seams are
     * hairline-tight with no rounding gap. The last segment's right edge is the
     * panel edge itself, so the bar closes on an exact boundary. */
    const segs = d.languages.map((l, i) => {
      const from = d.languages.slice(0, i).reduce((acc, s) => acc + s.pct, 0) / 100;
      return { ...l, from, to: from + l.pct / 100 };
    });

    segs.forEach((s, i) => {
      const sx = PANEL_X + s.from * PANEL_W;
      const ex = PANEL_X + (i === segs.length - 1 ? 1 : s.to) * PANEL_W;
      const wSeg = Math.max(2, ex - sx);
      const isFirst = i === 0;
      const isLast = i === segs.length - 1;
      const fill = i === 0 ? 'var(--accent)' : i === 1 ? 'var(--accent2)' : 'var(--text3)';
      const r = UNIT;
      const t = `<title>${escXml(`${s.name} \u2014 ${pctLabel(s.pct)} of bytes`)}</title>`;

      if (isFirst && isLast) {
        body.push(rect({ x: sx, y: LANG_BAR_Y, w: wSeg, h: LANG_BAR_H, r, fill, cls: 'activity-langseg', title: `${s.name} \u2014 ${pctLabel(s.pct)} of bytes` }));
      } else if (isFirst) {
        body.push(
          `<path class="activity-langseg" d="M${n(sx + r)} ${LANG_BAR_Y} H${n(ex)} V${LANG_BAR_Y + LANG_BAR_H} H${n(sx + r)} A${r} ${r} 0 0 1 ${n(sx)} ${LANG_BAR_Y + LANG_BAR_H - r} V${LANG_BAR_Y + r} A${r} ${r} 0 0 1 ${n(sx + r)} ${LANG_BAR_Y} Z" fill="${fill}">${t}</path>`,
        );
      } else if (isLast) {
        body.push(
          `<path class="activity-langseg" d="M${n(sx)} ${LANG_BAR_Y} H${n(ex - r)} A${r} ${r} 0 0 1 ${n(ex)} ${LANG_BAR_Y + r} V${LANG_BAR_Y + LANG_BAR_H - r} A${r} ${r} 0 0 1 ${n(ex - r)} ${LANG_BAR_Y + LANG_BAR_H} H${n(sx)} Z" fill="${fill}">${t}</path>`,
        );
      } else {
        body.push(`<rect class="activity-langseg" x="${n(sx)}" y="${LANG_BAR_Y}" width="${n(wSeg)}" height="${LANG_BAR_H}" fill="${fill}">${t}</rect>`);
      }
    });

    /* Legend. At most two named rows keeps the palette to one hue family;
     * anything past the second language folds into one neutral "Other" row
     * instead of introducing a third hue. */
    const rows = [];
    if (d.languages.length <= 2) {
      d.languages.forEach((l, i) =>
        rows.push({ name: l.name, pct: l.pct, fill: i === 0 ? 'var(--accent)' : 'var(--accent2)' }),
      );
    } else {
      rows.push({ name: d.languages[0].name, pct: d.languages[0].pct, fill: 'var(--accent)' });
      rows.push({
        name: 'Other (\u22652)',
        pct: d.languages.slice(1).reduce((acc, l) => acc + l.pct, 0),
        fill: 'var(--text3)',
      });
    }

    rows.forEach((row, i) => {
      const ry = LEGEND_Y + i * LEGEND_GAP;
      body.push(
        rect({ x: PANEL_X, y: ry - 9, w: 8, h: 8, r: 2, fill: row.fill, cls: 'activity-langdot' }),
        svgText({ x: PANEL_X + 16, y: ry, value: row.name, fill: 'var(--text1)', size: 12, weight: 600, cls: 'activity-langname' }),
        svgText({ x: PCT_X, y: ry, value: pctLabel(row.pct), fill: 'var(--text2)', size: 12, anchor: 'end', cls: 'activity-langpct' }),
      );
      if (i < rows.length - 1) body.push(rule({ x: PANEL_X, y: ry + 11, w: PANEL_W, cls: 'activity-hair' }));
    });
  } else {
    body.push(
      svgText({
        x: PANEL_X, y: LANG_BAR_Y + 18, value: 'No language bytes recorded yet.',
        fill: 'var(--text3)', size: 11, cls: 'activity-meta',
      }),
    );
  }

  /* ------------------------------------------------------------- meta line */
  const peak = d.days.reduce((best, a) => (a.count > best.count ? a : best), { date: '', count: 0 });

  /* Two facts on one line, each anchored to the column it describes:
   *   left  — what the window measured (under the activity strip)
   *   right — what the account holds   (under the language block)
   * Neither sentence can be misread as belonging to the other column. */
  const windowFact = zero
    ? `0 contributions \u00b7 0 active days in the last ${d.daysCount} days`
    : `${d.contributions} ${d.contributions === 1 ? 'contribution' : 'contributions'} on ${d.activeDays} active ${d.activeDays === 1 ? 'day' : 'days'} \u00b7 longest streak ${d.longestStreak} \u00b7 last ${d.daysCount} days`;
  const accountFact = `${d.repos} ${d.repos === 1 ? 'repository' : 'repositories'} \u00b7 ${d.stars} ${d.stars === 1 ? 'star' : 'stars'}${
    d.yearTotal > d.contributions
      ? ` \u00b7 ${d.yearTotal} contributions in the last year`
      : ''
  }`;

  body.push(svgText({ x: PAD, y: META_Y, value: windowFact, fill: 'var(--text3)', size: 11, cls: 'activity-meta' }));
  body.push(svgText({ x: PAD_R, y: META_Y, value: accountFact, fill: 'var(--text3)', size: 11, anchor: 'end', cls: 'activity-meta' }));

  /* The tooltip layer is emitted LAST so it paints above the meta row and the
   * language legend. Nothing may be appended after this. */
  body.push(`<g id="activity-tips" aria-hidden="true">${tipLayer.join('')}</g>`);

  /* --------------------------------------------------------- document root */
  const title = zero
    ? `Activity and languages for 3332210 \u2014 no contributions in the last ${d.daysCount} days`
    : `Activity and languages for 3332210 \u2014 ${d.contributions} contributions on ${d.activeDays} active days in the last ${d.daysCount} days`;
  const langPhrase = d.languages.length
    ? d.languages.map((l) => `${l.name} ${pctLabel(l.pct)}`).join(', ')
    : 'no languages recorded yet';
  const desc = zero
    ? `A quiet ${d.daysCount}-day activity strip with no contributions recorded, beside a language breakdown: ${langPhrase}.`
    : `A ${d.daysCount}-day activity strip: ${d.contributions} contributions on ${d.activeDays} days, longest streak ${d.longestStreak}, peak ${peak.count} on ${peak.date}. Beside it, a stacked bar of the language mix: ${langPhrase}.`;

  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" class="${cls}" aria-labelledby="activity-title activity-desc">
  <title id="activity-title">${escXml(title)}</title>
  <desc id="activity-desc">${escXml(desc)}</desc>
  ${styleBlock({ scope , theme: opts?.theme ?? null })}
  ${assetCss(d.days.length)}
  ${body.join('\n  ')}
</svg>
`,
  };
}

export default render;
