/**
 * Hero banner — 1100 × 320, generator for the GitHub profile of `3332210`.
 *
 * Design intent (design-system.md §1): a product page, not a slide. A
 * left-aligned identity column (kicker / name / positioning / real stat pills)
 * and one terminal panel that types a short build session, settles, and stops.
 * Two colours carry meaning: `--accent` on the shell prompts, `--good` on the
 * single drawn check mark. Nothing glows; the only looping element is a resting
 * caret at a 2.6 s period.
 *
 * Contract
 *   render(data, opts) -> { svg }      zero deps, pure ESM, deterministic, Node 20+
 *   opts.scheme === 'light'            forced-light variant (build.mjs previews)
 *   no opts                            byte-identical to the shipped asset
 *
 * Data — everything is optional. Every fallback is derived from what
 * `data/stats.json` actually contains; nothing here invents a number the data
 * cannot back (content-guide.md §2/§3).
 *   data.user.login, data.user.name, data.user.bio, data.user.publicRepos
 *   data.totals.publicRepos, data.totals.stars
 *   data.repos[0].license
 *   data.generatedAt
 *   data.hero = {                      // optional copy overrides
 *     login, name, tagline, taglineEn, kicker,
 *     stats:    [{ value, label }],
 *     terminal: { path, lines: [...], output: { text, tone } }
 *   }
 *
 * Animation envelope (design-system.md §4): CSS only, no SMIL, no script.
 *   - Every animated property carries its FINAL value in the base stylesheet, so
 *     a client that ignores CSS animations and a rasteriser both render the
 *     finished frame — no text is ever left mid-clip at rest.
 *   - The root carries `data-motion="true"`, which is what opts this asset into
 *     the shared reduced-motion rule in tokens.styleBlock (that rule zeroes the
 *     animation clock rather than revealing opacity, so state-hidden elements
 *     such as tooltips stay hidden). With the clock pinned, every animation
 *     lands on its 100 % keyframe — which is the finished frame by construction,
 *     and why the blink cycle ends *on* (opacity 1) instead of mid-fade.
 *   - Terminal copy is gated by a hard character budget (CMD_CHARS). A line that
 *     cannot fit throws instead of being ellipsised: a silently trimmed command
 *     is indistinguishable from a broken typewriter. `textLength` below only
 *     sets the advance so the caret can ride the clip edge exactly; the clip is
 *     2 units wider than the measured run, so no glyph is ever cut.
 */
import {
  FRAME_W, HERO_H, PAD, RADIUS, THEMES, ALPHA,
  EASE_OUT, T_FAST, T_BASE, styleBlock, rootClass, alpha,
} from '../tokens.mjs';
import { roundedRect, panel, pill, label, text as svgText, rule, n } from './primitives.mjs';

const SCOPE = 'hero';
const W = FRAME_W;
const H = HERO_H;

/* ------------------------------------------------------------------ geometry */

const LEFT_X = PAD;                     // 28
const LEFT_W = 472;                     // identity column; 48 unit gutter to the panel
const RIGHT_X = 548;
const RIGHT_W = W - PAD - RIGHT_X;      // 524  -> 548 .. 1072
const PANEL_Y = PAD;                    // 28
const PANEL_H = H - PAD * 2;            // 28 .. 292, bottom edge on the baseline
const INSET = 18;                       // panel inner padding
const TEXT_X = RIGHT_X + INSET;         // 566  shell prompt
const CMD_X = TEXT_X + 18;              // 584  command text, two mono advances in
const HEADER_H = 36;
const BASELINE_Y = H - PAD;             // 292  the one guide mark: everything rests on it

/* The identity column is dealt out over the full height rather than stacked at
 * the top — meta, then the name, then the evidence, with the pills sitting on
 * the same baseline the terminal panel stands on. */
const KICKER_Y = 52;                    // 12 meta, uppercase, tracked
const NAME_Y = 132;                     // 42 display
const CN_Y = 172;                       // 16 body
const LINE_H = 22;
const PILL_H = 22;                      // primitives.pill() default height
const PILL_GAP = 8;
const PILL_X = LEFT_X;

const MONO_SIZE = 17;
const TITLE_SIZE = 12;
const MONO_ADV_EM = 0.6;                // one mono advance, in em
/** Width the command/output column may use, and the hard character budget it implies. */
const TEXT_BUDGET = RIGHT_X + RIGHT_W - INSET - CMD_X;
const CMD_CHARS = Math.floor(TEXT_BUDGET / (MONO_SIZE * MONO_ADV_EM));
const ROW_TOP = PANEL_Y + HEADER_H + 32;        // 96  first baseline inside the panel
const ROW_MAX = BASELINE_Y - 16;                // 276 last baseline the body may reach

/* Timeline (ms); derived from the command count so 1..4 lines all settle.
 * These are numbers — tokens.T_BASE / T_FAST are CSS strings and must only be
 * interpolated directly into a declaration, never into arithmetic. */
const T_LEAD = 200;                     // the shell is already waiting at t=0
const T_TYPE = 560;                     // per command, linear
const T_GAP = 80;
const T_SETTLE = 320;                   // == tokens.T_BASE, as a number
const T_RISE = 180;                     // == tokens.T_FAST, as a number

/* --------------------------------------------------------------- text metrics */

/** Helvetica/AFM advance widths in em — the widest common ancestor of the sans stack. */
const EM = {
  ' ': 0.278, '!': 0.278, '"': 0.355, '#': 0.556, $: 0.556, '%': 0.889, '&': 0.667, "'": 0.191,
  '(': 0.333, ')': 0.333, '*': 0.389, '+': 0.584, ',': 0.278, '-': 0.333, '.': 0.278, '/': 0.278,
  0: 0.556, 1: 0.556, 2: 0.556, 3: 0.556, 4: 0.556, 5: 0.556, 6: 0.556, 7: 0.556, 8: 0.556, 9: 0.556,
  ':': 0.278, ';': 0.278, '<': 0.584, '=': 0.584, '>': 0.584, '?': 0.556, '@': 1.015,
  A: 0.667, B: 0.667, C: 0.722, D: 0.722, E: 0.667, F: 0.611, G: 0.778, H: 0.722, I: 0.278,
  J: 0.5, K: 0.667, L: 0.556, M: 0.833, N: 0.722, O: 0.778, P: 0.667, Q: 0.778, R: 0.722,
  S: 0.667, T: 0.611, U: 0.722, V: 0.667, W: 0.944, X: 0.667, Y: 0.667, Z: 0.611,
  '[': 0.278, '\\': 0.278, ']': 0.278, '^': 0.469, _: 0.556, '`': 0.333,
  a: 0.556, b: 0.556, c: 0.5, d: 0.556, e: 0.556, f: 0.278, g: 0.556, h: 0.556, i: 0.222,
  j: 0.222, k: 0.5, l: 0.222, m: 0.833, n: 0.556, o: 0.556, p: 0.556, q: 0.556, r: 0.333,
  s: 0.5, t: 0.278, u: 0.556, v: 0.5, w: 0.722, x: 0.5, y: 0.5, z: 0.5,
  '{': 0.334, '|': 0.26, '}': 0.334, '~': 0.584, '…': 0.9, '·': 0.333, '✓': 0.9,
};

const isWide = (cp) => cp >= 0x2e80;    // CJK / kana / hangul render full-width

/**
 * Estimated advance width.
 *
 * For mono runs the estimate is also *forced* onto the element through
 * `textLength`, which is what lets the typing caret ride the clip edge exactly
 * with no runtime measurement and no font dependence.
 */
function advWidth(s, size, { mono = false, tracking = 0, weight = 400 } = {}) {
  const chars = [...String(s)];
  let em = 0;
  for (const c of chars) em += mono ? 0.6 : EM[c] ?? (isWide(c.codePointAt(0)) ? 1 : 0.6);
  // Segoe UI / Inter / Roboto run a little wider than Helvetica; the slack keeps
  // truncation on the safe side of the frame instead of one glyph over it.
  const slack = mono ? 1 : 1.06 + (weight >= 600 ? 0.01 : 0);
  return (em * size + tracking * size * Math.max(0, chars.length - 1)) * slack;
}

/** Largest prefix that fits `maxW`, ellipsised. */
function truncate(s, maxW, opts = {}) {
  const str = String(s);
  if (advWidth(str, opts.size, opts) <= maxW) return str;
  const chars = [...str];
  const ellW = advWidth('…', opts.size, opts);
  for (let k = chars.length - 1; k > 0; k--) {
    const cand = chars.slice(0, k).join('').replace(/[\s,;:·]+$/, '');
    if (advWidth(cand, opts.size, opts) + ellW <= maxW) return cand + '…';
  }
  return '…';
}

/** Break units: one CJK glyph each, otherwise whitespace-delimited words. */
function units(s) {
  const out = [];
  for (const chunk of String(s).trim().split(/\s+/)) {
    let cur = '';
    for (const ch of chunk) {
      if (isWide(ch.codePointAt(0))) {
        if (cur) out.push({ t: cur, wide: false });
        out.push({ t: ch, wide: true });
        cur = '';
      } else cur += ch;
    }
    if (cur) out.push({ t: cur, wide: false });
  }
  return out;
}

/** Greedy wrap. CJK glyphs join without spaces, Latin words keep theirs. */
function wrap(s, maxW, maxLines, opts = {}) {
  const us = units(s);
  const join = (a, b) => (a.wide && b.wide ? '' : ' ');
  const lines = [];
  let cur = null;
  for (const u of us) {
    const cand = cur === null ? u : { t: cur.t + join(cur, u) + u.t, wide: u.wide };
    if (cur !== null && advWidth(cand.t, opts.size, opts) > maxW) { lines.push(cur); cur = u; }
    else cur = cand;
  }
  if (cur) lines.push(cur);
  if (lines.length <= maxLines) return lines.map((l) => l.t);
  const kept = lines.slice(0, maxLines).map((l) => l.t);
  kept[maxLines - 1] = truncate(kept[maxLines - 1], maxW, opts);
  return kept;
}

/* ----------------------------------------------------------------- data model */

const DEFAULT_TAGLINE = '写工具，解决那些每个人都默默忍受的小问题。';
const DEFAULT_TAGLINE_EN = 'Small tools for problems everyone quietly puts up with.';
// The account's actual story: one DSH plugin, cloned, installed, tested, and it
// answers the only question a notifier has to answer — why did the turn end.
// Every claim here is in the repo's own README or in data/stats.json.
const DEFAULT_CMDS = ['git clone 3332210/dsh-notify-cues', 'dsh plugin add dsh-notify-cues', 'node --test'];
const DEFAULT_OUTPUT = '6 reasons · 6 chimes · 0 audio files';

/** Everything the artwork needs, derived once. Pure: same data in, same model out. */
function buildModel(data) {
  const d = data ?? {};
  const user = d.user ?? {};
  const totals = d.totals ?? {};
  const hero = d.hero ?? d.copy ?? {};
  const repos = Array.isArray(d.repos) ? d.repos : [];
  const top = d.featured ?? repos.find((r) => r && !r.fork && !r.archived) ?? repos[0] ?? null;

  const login = String(hero.login ?? user.login ?? d.login ?? '3332210');
  const name = String(hero.name ?? user.name ?? login);
  const tagline = String(hero.tagline ?? user.bio ?? DEFAULT_TAGLINE);
  const taglineEn = hero.taglineEn ?? (user.bio ? null : DEFAULT_TAGLINE_EN);

  const updated = typeof d.generatedAt === 'string' ? d.generatedAt.slice(0, 10) : null;
  const kicker = String(hero.kicker
    ?? ['GITHUB PROFILE', updated ? `UPDATED ${updated}` : null].filter(Boolean).join(' · '));

  // Three real, stable facts — one project, its traction, and the four commits
  // behind it. No vanity metrics, no invented numbers; each one is pluralised
  // here so the label is always grammatical.
  const repoCount = totals.publicRepos ?? user.publicRepos ?? null;
  const starCount = totals.stars ?? top?.stars ?? null;
  const commitCount = top?.commitCount ?? (Array.isArray(d.commits) ? d.commits.length : null);
  const stats = Array.isArray(hero.stats) ? hero.stats : [
    repoCount != null ? { value: String(repoCount), label: repoCount === 1 ? 'public repo' : 'public repos' } : null,
    starCount != null ? { value: String(starCount), label: starCount === 1 ? 'star' : 'stars' } : null,
    commitCount != null ? { value: String(commitCount), label: commitCount === 1 ? 'commit' : 'commits' } : null,
  ].filter(Boolean);

  const term = hero.terminal ?? {};
  const lines = (Array.isArray(term.lines) && term.lines.length ? term.lines : DEFAULT_CMDS)
    .slice(0, 4).map((l) => String(l));

  return {
    login,
    name,
    tagline,
    taglineEn: taglineEn == null ? null : String(taglineEn),
    kicker,
    stats: stats.slice(0, 4).map((s) => ({
      value: String(s?.value ?? ''),
      label: s?.label == null ? null : String(s.label),
    })).filter((s) => s.value || s.label),
    term: {
      path: String(term.path ?? `~/${login}`),
      lines,
      output: {
        text: String(term.output?.text ?? DEFAULT_OUTPUT),
        tone: term.output?.tone ?? 'good',
      },
    },
  };
}

const statText = (s) => [s.value, s.label].filter(Boolean).join(' ');
const statTitle = (s) => statText(s) || s.value;

/* ----------------------------------------------------------------------- CSS */

/** The single accent-alpha this asset needs, in both schemes (design-system §2). */
function alphaVars() {
  const s = `.${SCOPE}`;
  const dark = alpha(THEMES.dark.accent, ALPHA[0]);
  const light = alpha(THEMES.light.accent, ALPHA[0]);
  return [
    `${s}{--hero-acc-08:${dark}}`,
    `${s}-light${s}{--hero-acc-08:${light}}`,
    `@media (prefers-color-scheme: light){${s}{--hero-acc-08:${light}}}`,
  ];
}

/**
 * Motion: commands type, the result appears, one caret blinks at rest.
 *
 * Fill modes are deliberate:
 *   `both`      for things that must be absent before their turn (clip rects,
 *               later prompts, the output row) — the 0 % frame covers the delay.
 *   `forwards`  for the typing carets, whose base style is `visibility:hidden`,
 *               so they can never flash before their line starts.
 * `visibility` is used rather than `opacity` for those carets because the
 * shared reduced-motion rule forces `opacity:1 !important` on every element.
 */
function motionCSS(model, widths) {
  const out = [...alphaVars()];
  const count = model.term.lines.length;
  const starts = [];
  for (let i = 0; i < count; i++) starts.push(T_LEAD + i * (T_TYPE + T_GAP));

  out.push(`.${SCOPE} .hero-pill rect{transition:fill ${T_FAST} ${EASE_OUT},stroke ${T_FAST} ${EASE_OUT}}`);
  out.push(`.${SCOPE} .hero-pill:hover rect{fill:var(--hero-acc-08);stroke:var(--line-strong)}`);

  for (let i = 0; i < count; i++) {
    const id = i + 1;
    const at = starts[i];
    const w = widths[i];
    out.push(`@keyframes hero-clip-${id}{from{width:0px}to{width:${w}px}}`);
    out.push(`#hero-clip-rect-${id}{animation:hero-clip-${id} ${T_TYPE}ms linear ${at}ms both}`);
    // The first line's caret is already there at t=0: the shell is waiting for
    // input before anything is typed, which is what makes the first frame read
    // as finished rather than empty. It holds, then rides the clip edge exactly
    // (same distance over the same window as the clip above).
    const lead = i === 0 ? T_LEAD : 0;
    const dur = lead + T_TYPE;
    // transform is keyed only at 0 / hold / 100 so it stays exactly linear with
    // the clip above; opacity is keyed separately so the caret cannot fade
    // while it is still typing.
    const hold = lead ? `${n((lead / dur) * 100)}%{transform:translateX(0px);opacity:1}` : '';
    out.push(`@keyframes hero-caret-${id}{0%{visibility:visible;transform:translateX(0px);opacity:1}${hold}95%{opacity:1}100%{visibility:hidden;transform:translateX(${w}px);opacity:0}}`);
    out.push(`#hero-caret-${id}{visibility:hidden;animation:hero-caret-${id} ${dur}ms linear ${at - lead}ms forwards}`);
    if (i > 0) out.push(`#hero-prompt-${id}{animation:hero-prompt-in ${T_BASE} ${EASE_OUT} ${at - 120}ms both}`);
  }

  const lastEnd = starts[count - 1] + T_TYPE;
  const outAt = lastEnd + 180;
  const restAt = outAt + T_SETTLE + 120;
  out.push('@keyframes hero-prompt-in{from{opacity:0}to{opacity:1}}');
  out.push('@keyframes hero-rise{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}');
  out.push(`#hero-output{animation:hero-rise ${T_BASE} ${EASE_OUT} ${outAt}ms both}`);
  out.push(`#hero-rest{animation:hero-rise ${T_FAST} ${EASE_OUT} ${restAt}ms both}`);
  out.push(`#hero-blink{animation:hero-blink 2600ms ${EASE_OUT} ${restAt + T_RISE}ms infinite both}`);
  // The cycle ends *on* rather than off: with reduced motion the shared rule
  // pins the clock to zero, so the 100 % frame is what those readers see, and it
  // has to be a solid caret — not the 12 % frame of the blink.
  out.push('@keyframes hero-blink{0%{opacity:1}48%{opacity:1}52%{opacity:.12}96%{opacity:.12}100%{opacity:1}}');
  return out.join('\n    ');
}

const escXml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* -------------------------------------------------------------------- render */

/**
 * @param {object} [data]  see the data contract at the top of this file
 * @param {{scheme?: 'light'|null}} [opts]
 * @returns {{svg: string}}
 */
export function render(data = {}, opts = {}) {
  const cls = rootClass(SCOPE, opts?.scheme ?? null);
  const m = buildModel(data);

  /* --- identity column ---------------------------------------------------- */
  const left = [
    label({ x: LEFT_X, y: KICKER_Y, text: m.kicker, size: TITLE_SIZE, fill: 'var(--text3)' }),
    svgText({
      x: LEFT_X, y: NAME_Y, value: truncate(m.name, LEFT_W, { size: 42, tracking: -0.02, weight: 700 }),
      size: 42, weight: 700, ls: '-0.02em', fill: 'var(--text1)',
    }),
  ];

  let cnY = CN_Y;
  for (const line of wrap(m.tagline, LEFT_W, 2, { size: 16 })) {
    left.push(svgText({ x: LEFT_X, y: cnY, value: line, size: 16, fill: 'var(--text2)' }));
    cnY += LINE_H;
  }
  let lastY = cnY - LINE_H;

  if (m.taglineEn) {
    lastY += LINE_H;
    for (const line of wrap(m.taglineEn, LEFT_W, 2, { size: TITLE_SIZE })) {
      left.push(svgText({ x: LEFT_X, y: lastY, value: line, size: TITLE_SIZE, fill: 'var(--text2)' }));
      lastY += LINE_H;
    }
    lastY -= LINE_H;
  }

  /* --- stat pills --------------------------------------------------------- */
  // Pinned to the baseline rather than flowed: the pills and the terminal panel
  // stand on the same hairlines, which is what ties the two columns together.
  const pillY = BASELINE_Y - PILL_H - 2;
  let px = PILL_X;
  for (const s of m.stats) {
    const t = statText(s);
    const w = Math.round(advWidth(t, TITLE_SIZE) + 22);
    if (px + w > LEFT_X + LEFT_W) break;         // never cross into the panel gutter
    left.push(`<g class="hero-pill"><title>${escXml(statTitle(s))}</title>${pill({
      x: px, y: pillY, text: t, w, h: PILL_H, size: TITLE_SIZE,
      fill: 'var(--bg2)', stroke: 'var(--line)', color: 'var(--text2)',
    })}</g>`);
    px += w + PILL_GAP;
  }

  /* --- terminal panel ----------------------------------------------------- */
  // Rows are dealt out over the panel body so a 3- or 4-line session both fill
  // it without leaving a dead band under the last prompt.
  const rows = m.term.lines.length + 2;          // commands + output + resting prompt
  const pitch = rows > 1
    ? Math.max(30, Math.min(38, Math.floor((ROW_MAX - ROW_TOP) / (rows - 1))))
    : 38;
  const rowY = (i) => ROW_TOP + i * pitch;

  const right = [
    panel({ x: RIGHT_X + 0.5, y: PANEL_Y + 0.5, w: RIGHT_W - 1, h: PANEL_H - 1 }),
    rule({ x: RIGHT_X + 0.5, y: PANEL_Y + HEADER_H, w: RIGHT_W - 1, stroke: 'var(--line)' }),
    svgText({ x: TEXT_X, y: KICKER_Y, value: m.term.path, size: TITLE_SIZE, mono: true, fill: 'var(--text3)' }),
  ];

  // The character budget is a hard gate, not a soft trim: a line that cannot fit
  // is a content bug, and a silently ellipsised command would read as a broken
  // typewriter. `textLength` below only *sets the advance* so the caret can ride
  // the clip edge exactly — the clip is 2 units wider than the measured run, so
  // no visible glyph is ever cut, at rest or mid-animation.
  for (const [i, raw] of m.term.lines.entries()) {
    const len = [...raw].length;
    if (len > CMD_CHARS) {
      throw new Error(
        `hero: terminal line ${i + 1} is ${len} chars, budget is ${CMD_CHARS} ` +
        `(${Math.round(TEXT_BUDGET)} units at ${MONO_SIZE}/${MONO_ADV_EM}em). ` +
        `Shorten the copy or raise MONO_SIZE-aware geometry — do not let it clip: "${raw}"`,
      );
    }
  }
  if ([...m.term.output.text].length > CMD_CHARS) {
    throw new Error(`hero: output line is ${[...m.term.output.text].length} chars, budget is ${CMD_CHARS}: "${m.term.output.text}"`);
  }

  const defs = [];
  const widths = [];
  m.term.lines.forEach((raw, i) => {
    const id = i + 1;
    const y = rowY(i);
    const textW = n(advWidth(raw, MONO_SIZE, { mono: true }));
    const clipW = n(Number(textW) + 2);
    widths.push(clipW);
    defs.push(`<clipPath id="hero-clip-${id}" clipPathUnits="userSpaceOnUse"><rect id="hero-clip-rect-${id}" x="${CMD_X}" y="${y - 16}" width="${clipW}" height="24"/></clipPath>`);
    right.push(svgText({ x: TEXT_X, y, value: '$', size: MONO_SIZE, mono: true, fill: 'var(--accent)', extra: `id="hero-prompt-${id}"` }));
    right.push(`<g clip-path="url(#hero-clip-${id})"><text x="${CMD_X}" y="${y}" fill="var(--text2)" font-size="${MONO_SIZE}" class="mono" textLength="${textW}" lengthAdjust="spacing">${escXml(raw)}</text></g>`);
    right.push(roundedRect({ x: CMD_X, y: y - 13, w: 2, h: 18, r: 1, fill: 'var(--accent)', extra: `id="hero-caret-${id}"` }));
  });

  // The one output line: the session's payoff, the brightest text in the panel.
  const outY = rowY(m.term.lines.length);
  const tone = m.term.output.tone === 'warn' ? 'var(--warn)'
    : m.term.output.tone === 'plain' ? 'var(--text3)' : 'var(--good)';
  right.push(`<g id="hero-output">
      <path d="M${TEXT_X + 0.5} ${outY - 5.5} l3.3 3.4 l7 -7.5" fill="none" stroke="${tone}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"/>
      <text x="${CMD_X}" y="${outY}" fill="var(--text1)" font-size="${MONO_SIZE}" class="mono">${escXml(m.term.output.text)}</text>
    </g>`);

  // Resting prompt: the session is over and the shell is waiting. Only loop.
  const restY = rowY(m.term.lines.length + 1);
  right.push(`<g id="hero-rest">
      ${svgText({ x: TEXT_X, y: restY, value: '$', size: MONO_SIZE, mono: true, fill: 'var(--accent)' })}
      ${roundedRect({ x: CMD_X, y: restY - 13, w: 9, h: 18, r: 1.5, fill: 'var(--accent)', extra: 'id="hero-blink"' })}
    </g>`);

  // The one guide mark: the baseline the panel and the pills both stand on.
  // It stops where the panel's bottom-left radius begins, so the two meet flush.
  left.push(rule({ x: LEFT_X, y: BASELINE_Y, w: RIGHT_X + RADIUS - LEFT_X, stroke: 'var(--line)' }));

  /* --- document ----------------------------------------------------------- */
  const title = `${m.name} · GitHub profile`;
  const desc = [
    m.tagline,
    m.taglineEn,
    `Terminal session: ${m.term.lines.join('; ')} → ${m.term.output.text}.`,
    m.stats.length ? `Facts shown: ${m.stats.map(statTitle).join(', ')}.` : null,
  ].filter(Boolean).join(' ');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" class="${cls}" data-motion="true" aria-labelledby="hero-title hero-desc">
  <title id="hero-title">${escXml(title)}</title>
  <desc id="hero-desc">${escXml(desc)}</desc>
  ${styleBlock({ scope: SCOPE })}
  <style>
    ${motionCSS(m, widths)}
  </style>
  <defs>${defs.join('')}</defs>
  ${roundedRect({ x: 0.5, y: 0.5, w: W - 1, h: H - 1, r: RADIUS, fill: 'var(--bg0)', stroke: 'var(--line)' })}
  <g>${left.join('\n    ')}</g>
  <g>${right.join('\n    ')}</g>
</svg>
`;
  return { svg };
}

export default { render };
