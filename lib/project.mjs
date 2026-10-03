/**
 * Featured project card — 1100 × 228.
 *
 * One product surface, not a badge box:
 *   · left: repo identity — mono name, one description, one row of topic pills
 *   · right: the hard numbers as stat() on a shared baseline, over an inset well
 *     that carries the one data-derived device: commit marks on a real axis
 *   · top edge: a two-segment rail whose lengths are the language share by bytes
 *
 * Everything is composed from lib/primitives.mjs. Colours come from tokens.mjs
 * via var(--token), so the scheme switch is CSS-only.
 *
 * SCOPE CONTRACT (design-system.md §6): root class is `rootClass('project', opts.scheme)`,
 * every element id is prefixed `project-` (this asset currently needs none), and
 * render(data) with no opts produces exactly the shipped asset.
 */
import { FRAME_W, PAD, RADIUS, EASE_OUT, styleBlock, rootClass } from '../tokens.mjs';
import { panel, pill, stat, label, text, rule, roundedRect, svgRoot } from './primitives.mjs';

export const HEIGHT = 228;

const SCOPE = 'project';

/* ------------------------------------------------------------------ geometry */

const PANEL = { x: PAD, y: PAD, w: FRAME_W - 2 * PAD, h: HEIGHT - 2 * PAD, r: RADIUS };
const INNER = 24;

const CT = PANEL.y + INNER;                     // content top      52
const CB = PANEL.y + PANEL.h - INNER;           // content bottom  176
const CX = PANEL.x + INNER;                     // content left     52
const CR = PANEL.x + PANEL.w - INNER;           // content right  1048

const LEFT_W = 578;                             // ~58% of the 996-unit content width
const GUTTER = 36;
const RX = CX + LEFT_W + GUTTER;                // right column x  666
const RW = CR - RX;                             // right column w  382

const Y_TITLE = 73;                             // shared baseline: repo name + stat values
const DESC_SIZE = 15;
const DESC_LEAD = 22;
const DESC_MAX_LINES = 2;
const Y_DESC = 106;

const PILL_H = 22;
const Y_PILLS = CB - PILL_H;                    // 154, bottom-aligned with the well
const PILL_GAP = 8;

const META_SIZE = 11;
const Y_META = Y_PILLS + PILL_H / 2 + META_SIZE * 0.35;   // pill label baseline == meta baseline
/** The title owns its row; the meta may use at most this much of it. */
const META_BUDGET = Math.round(LEFT_W * 0.45);
const TITLE_META_GAP = 24;

const WELL = { x: RX, y: 104, w: RW, h: CB - 104, r: 8 };

/** Device box inside the well. */
const DEV = { x: WELL.x + 14, w: WELL.w - 28, top: WELL.y + 12, base: 146, labelY: 162 };
DEV.right = DEV.x + DEV.w;

const STAT_PITCH = 128;

/* --------------------------------------------------------------- text metrics */

/**
 * Advance-width model, so long strings can be wrapped and truncated against a
 * measured budget instead of hoping the font is narrow. Tuned against real
 * Segoe UI metrics (see _scratch/project/measure.svg), then padded: the reader's
 * font may be wider than the one this was measured with, and an overflow is a
 * far worse failure than truncating two characters early.
 */
const SANS_EM = {
  narrow: "ijltfr.,:;'\u00b7!|()[]{}-",
  wide: 'mwMW@%\u2014\u2192',
  narrowW: 0.31,
  wideW: 0.98,
  upperW: 0.67,
  digitW: 0.57,
  spaceW: 0.28,
  otherW: 0.54,
};
const SANS_SAFETY = 1.05;
const MONO_EM = 0.62;
const ELLIPSIS = '\u2026';

function charEm(ch, m) {
  if (ch === ' ') return m.spaceW;
  if (ch >= '0' && ch <= '9') return m.digitW;
  if (ch >= 'A' && ch <= 'Z') return m.upperW;
  if (m.narrow.includes(ch)) return m.narrowW;
  if (m.wide.includes(ch)) return m.wideW;
  return m.otherW;
}

/** Estimated advance width of `str` at `size`, in user units. */
function measure(str, size, mono = false) {
  if (mono) return str.length * size * MONO_EM;
  let em = 0;
  for (const ch of str) em += charEm(ch, SANS_EM);
  return em * size * SANS_SAFETY;
}

/** Truncate to the widest prefix that fits, with a real ellipsis. */
function fitEllipsis(str, maxW, size, mono = false) {
  if (measure(str, size, mono) <= maxW) return str;
  let out = '';
  for (const ch of str) {
    if (measure(out + ch + ELLIPSIS, size, mono) > maxW) break;
    out += ch;
  }
  return out.replace(/\s+$/, '') + ELLIPSIS;
}

/** Cut an overflowing tail at a word boundary first; only split a word if it must. */
function tailEllipsis(str, maxW, size) {
  if (measure(str, size) <= maxW) return str;
  let out = '';
  for (const w of str.split(/\s+/).filter(Boolean)) {
    const candidate = out ? `${out} ${w}` : w;
    if (measure(candidate + ELLIPSIS, size) > maxW) break;
    out = candidate;
  }
  return out ? out + ELLIPSIS : fitEllipsis(str, maxW, size);
}

/**
 * Greedy word wrap capped at `maxLines`. Whatever does not fit is folded into the
 * last line and cut at a measured character budget — never allowed to overflow.
 */
function wrap(str, maxW, size, maxLines) {
  const words = String(str).split(/\s+/).filter(Boolean);
  const lines = [];
  let i = 0;
  while (i < words.length && lines.length < maxLines) {
    const start = i;
    let line = '';
    if (measure(words[i], size) > maxW) {
      // A single token wider than the column: character budget, not word budget.
      lines.push(fitEllipsis(words[i], maxW, size));
      i++;
    } else {
      while (i < words.length) {
        const candidate = line ? `${line} ${words[i]}` : words[i];
        if (line && measure(candidate, size) > maxW) break;
        line = candidate;
        i++;
      }
      lines.push(line);
    }
    if (i < words.length && lines.length === maxLines) {
      lines[maxLines - 1] = tailEllipsis(words.slice(start).join(' '), maxW, size);
    }
  }
  return lines;
}

/* -------------------------------------------------------------- data reading */

const asNum = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const day10 = (v) => (typeof v === 'string' && v.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
const firstOf = (...vals) => vals.find((v) => v !== undefined && v !== null && !(typeof v === 'number' && Number.isNaN(v)));

/** Whole days from a to b inclusive; null when either end is unusable. */
function spanDays(a, b) {
  if (!a || !b) return null;
  const d = Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000) + 1;
  return Number.isFinite(d) ? Math.max(1, d) : null;
}

/** `2026-10-02` -> `10-02`; a bucket spanning days reads `10-01 → 10-02`. */
function dayLabel(b) {
  const from = b.from ? b.from.slice(5) : '';
  const to = b.to ? b.to.slice(5) : '';
  if (!from) return '';
  return !to || to === from ? from : `${from} \u2192 ${to}`;
}

/** Large counts keep their magnitude: 100000 -> 100k, 1250000 -> 1.3M. */
function fmtCount(v) {
  const x = Math.max(0, Math.round(asNum(v)));
  const trim = (s) => s.replace(/\.0$/, '');
  if (x >= 999500) return trim((x / 1e6).toFixed(1)) + 'M';
  if (x >= 10000) return trim((x / 1e3).toFixed(1)) + 'k';
  return String(x);
}

/** Percentages read as written: 85.4% but a whole 100%, never "100.0%". */
const fmtPct = (p) => (p >= 99.95 ? '100%' : `${p.toFixed(1)}%`);

/**
 * At most three named rail segments. A longer tail is folded into `other` and the
 * legend names exactly what the rail draws, so the bar and its reading cannot disagree.
 */
function railShares(langs) {
  const named = langs.slice(0, langs.length > 3 ? 2 : 3);
  const out = named.map((l) => ({ name: l.name, pct: l.pct }));
  const rest = langs.slice(named.length).reduce((a, l) => a + l.pct, 0);
  if (rest > 0.05) out.push({ name: 'other', pct: rest });
  return out;
}

/** Most stars, then most recently pushed — same rule scripts/sync.mjs uses. */
function pickFeatured(data) {
  if (data && data.featured && typeof data.featured === 'object') return data.featured;
  const repos = Array.isArray(data?.repos) ? data.repos.filter(Boolean) : [];
  return [...repos].sort(
    (a, b) => asNum(b.stars) - asNum(a.stars) || (String(b.pushedAt ?? '') > String(a.pushedAt ?? '') ? 1 : -1),
  )[0] ?? {};
}

/** Commit days, from whichever shape the data file carries. */
function commitBuckets(data, repo, commitTotal) {
  const raw = Array.isArray(data?.commitDays) ? data.commitDays : [];
  const fromDays = raw
    .map((d) => ({ from: day10(d?.date), to: day10(d?.date), count: Math.max(0, Math.round(asNum(d?.count))) }))
    .filter((b) => b.from);
  if (fromDays.length) return fromDays.sort((a, b) => (a.from < b.from ? -1 : 1));

  const commits = Array.isArray(data?.commits) ? data.commits : [];
  const byDay = new Map();
  for (const c of commits) {
    const d = day10(c?.date);
    if (d) byDay.set(d, (byDay.get(d) ?? 0) + 1);
  }
  if (byDay.size) {
    return [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, count]) => ({ from: date, to: date, count }));
  }

  // No per-day history available: claim only what is actually known — one span
  // covering the repo's whole observed lifetime. When scripts/sync.mjs writes
  // `commitDays`, this collapses to the real per-day structure with no code change.
  const from = day10(repo.createdAt) ?? day10(data?.generatedAt);
  if (!from) return [];
  const to = day10(repo.pushedAt) ?? from;
  return [{ from, to: to >= from ? to : from, count: Math.max(0, Math.round(commitTotal)) }];
}

/** Fold a long tail of days into at most `max` buckets, so bars stay legible. */
function capBuckets(buckets, max = 14) {
  if (buckets.length <= max) return buckets;
  const size = Math.ceil(buckets.length / max);
  const out = [];
  for (let i = 0; i < buckets.length; i += size) {
    const chunk = buckets.slice(i, i + size);
    out.push({
      from: chunk[0].from,
      to: chunk[chunk.length - 1].to,
      count: chunk.reduce((a, b) => a + b.count, 0),
    });
  }
  return out;
}

function readData(data) {
  const repo = pickFeatured(data);
  const commits = Array.isArray(data?.commits) ? data.commits : [];
  const rawDays = Array.isArray(data?.commitDays) ? data.commitDays : [];

  const commitTotal = Math.max(0, Math.round(asNum(firstOf(
    repo.commitCount,
    commits.length || undefined,
    rawDays.length ? rawDays.reduce((a, d) => a + asNum(d?.count), 0) : undefined,
    data?.contribution?.total,
    data?.totals?.contributions,
    0,
  ))));

  const buckets = capBuckets(commitBuckets(data, repo, commitTotal));
  const first = buckets[0]?.from ?? null;
  const last = buckets[buckets.length - 1]?.to ?? buckets[buckets.length - 1]?.from ?? null;
  const repoFrom = day10(repo.createdAt);
  const repoTo = day10(repo.pushedAt);

  const buildDays = Math.max(1, Math.round(asNum(firstOf(
    repo.buildSpanDays,
    spanDays(repoFrom, repoTo),
    buckets.length > 1 ? spanDays(first, last) : undefined,
    1,
  ))));

  const langs = (Array.isArray(data?.languages) && data.languages.length ? data.languages : data?.totals?.languages ?? [])
    .filter((l) => l && l.name)
    .map((l) => ({ name: String(l.name), bytes: asNum(l.bytes), pct: asNum(l.pct) }))
    .sort((a, b) => b.bytes - a.bytes || b.pct - a.pct);
  const langBytes = langs.reduce((a, l) => a + l.bytes, 0);
  const shares = railShares(langs.map((l) => ({
    name: l.name,
    pct: langBytes > 0 ? (l.bytes / langBytes) * 100 : asNum(l.pct),
  })));

  return {
    name: String(repo.name ?? data?.user?.login ?? 'project'),
    description: String(repo.description ?? '').trim(),
    license: repo.license ? String(repo.license) : null,
    stars: Math.max(0, Math.round(asNum(repo.stars))),
    topics: (Array.isArray(repo.topics) ? repo.topics : []).map((t) => String(t)).filter(Boolean),
    commits: commitTotal,
    buckets,
    buildDays,
    shares,
    rangeLabel: first ? dayLabel({ from: first, to: last }) : '',
  };
}

/* ---------------------------------------------------------------- card parts */

/** Top-edge rail: segment lengths are the language share by bytes. */
function languageRail(data) {
  const x = PANEL.x + PANEL.r;
  const w = PANEL.w - 2 * PANEL.r;
  const y = PANEL.y + 1;
  const segs = data.shares.length ? data.shares.slice(0, 3) : [];
  if (!segs.length) return rule({ x, y, w, stroke: 'var(--line-strong)', sw: 2 });

  const total = segs.reduce((a, s) => a + s.pct, 0) || 1;
  const strokes = ['var(--accent)', 'var(--text3)', 'var(--line-strong)'];
  let cursor = x;
  const out = [];
  segs.forEach((s, i) => {
    const isLast = i === segs.length - 1;
    const seg = isLast ? x + w - cursor : Math.max(2, Math.round((w * s.pct) / total));
    out.push(rule({ x: cursor, y, w: seg, stroke: strokes[i] ?? 'var(--line-strong)', sw: 2 }));
    cursor += seg;
  });
  return out.join('');
}

/** The single device: commit marks on a real baseline, derived from the data. */
function device(buckets, commitTotal) {
  const live = buckets.filter((b) => b.count > 0);

  if (!live.length || commitTotal <= 0) {
    return [
      rule({ x: DEV.x, y: DEV.base, w: DEV.w, stroke: 'var(--line-strong)' }),
      label({ x: DEV.x + DEV.w / 2, y: DEV.labelY, text: 'no commits yet', anchor: 'middle' }),
    ].join('');
  }

  // Small, sparse histories read best as one mark per commit; dense ones as bars.
  return live.length <= 6 && live.reduce((a, b) => a + b.count, 0) <= 20
    ? notchDevice(live)
    : barDevice(live);
}

/**
 * One notch per commit, grouped by the day it landed on. Group centres are the
 * day's position on the span, so the marks encode both the count and where the
 * work happened — and a single day gets no axis, because there is no span to lie about.
 */
function notchDevice(live) {
  const NW = 11, NH = 22, NGAP = 5, GGAP = 22, R = 2;
  const gw = live.map((b) => b.count * NW + (b.count - 1) * NGAP);
  const half = Math.max(...gw) / 2;
  const usable = DEV.w - 2 * half;
  const centers = live.map((b, i) => (
    live.length === 1 ? DEV.x + DEV.w / 2 : DEV.x + half + (usable * i) / (live.length - 1)
  ));

  // The axis spans exactly the first to the last day it can vouch for — it never
  // draws timeline it does not have. A single day gets a rule under its own marks.
  const axisFrom = centers[0];
  const axisTo = centers[centers.length - 1];
  const out = [
    live.length === 1
      ? rule({ x: centers[0] - gw[0] / 2, y: DEV.base, w: gw[0], stroke: 'var(--line-strong)' })
      : rule({ x: axisFrom, y: DEV.base, w: axisTo - axisFrom, stroke: 'var(--line-strong)' }),
  ];

  live.forEach((b, i) => {
    const marks = [];
    let mx = centers[i] - gw[i] / 2;
    for (let k = 0; k < b.count; k++) {
      marks.push(roundedRect({ x: mx, y: DEV.base - NH, w: NW, h: NH, r: R, fill: 'var(--accent)', cls: 'project-mark' }));
      mx += NW + NGAP;
    }
    const tip = `${b.from}${b.to && b.to !== b.from ? ' \u2192 ' + b.to : ''} \u2014 ${b.count} commit${b.count === 1 ? '' : 's'}`;
    out.push(`<g class="project-group"><title>${tip}</title>${marks.join('')}</g>`);
  });

  // Group centres are at least a label-width apart in this mode, so every day
  // gets its date under it.
  live.forEach((b, i) => {
    out.push(text({
      x: centers[i], y: DEV.labelY, value: dayLabel(b),
      fill: 'var(--text3)', size: 11, anchor: 'middle', cls: 'mono',
    }));
  });

  return out.join('');
}

/** Dense histories: one bar per day (or per capped bucket), height = commits. */
function barDevice(live) {
  const slot = DEV.w / live.length;
  const bw = Math.max(3, Math.min(26, slot - 10));
  const max = Math.max(...live.map((b) => b.count));
  const out = [rule({ x: DEV.x, y: DEV.base, w: DEV.w, stroke: 'var(--line-strong)' })];
  const showAll = slot >= 46;

  live.forEach((b, i) => {
    const h = 8 + Math.round((b.count / max) * 18);
    const cx = DEV.x + slot * (i + 0.5);
    const tip = `${b.from}${b.to && b.to !== b.from ? ' \u2192 ' + b.to : ''} \u2014 ${b.count} commit${b.count === 1 ? '' : 's'}`;
    out.push(
      `<g class="project-group"><title>${tip}</title>` +
      roundedRect({ x: cx - bw / 2, y: DEV.base - h, w: bw, h, r: Math.min(2, bw / 2), fill: 'var(--accent)', cls: 'project-mark' }) +
      '</g>',
    );

    // Too many days to label: the ends carry the range, the middle stays quiet.
    const edge = i === 0 || i === live.length - 1;
    if (!showAll && !edge) return;
    out.push(text({
      x: showAll ? cx : i === 0 ? DEV.x : DEV.right,
      y: DEV.labelY, value: dayLabel(b), fill: 'var(--text3)', size: 11,
      anchor: showAll ? 'middle' : i === 0 ? 'start' : 'end',
      cls: 'mono',
    }));
  });

  return out.join('');
}

/** Topic pills: real topics, redundant taxonomy collapsed, capped by the row width. */
function topicRow(topics) {
  const picked = [];
  for (const t of topics) {
    if (picked.length >= 4) break;
    // "deepseek-harness-plugins" says nothing that "deepseek-harness" has not said.
    if (picked.some((p) => p !== t && (t.includes(p) || p.includes(t)))) continue;
    picked.push(t);
  }

  // Mono pill: `mono: true` sizes the box from the primitive's mono budget
  // (0.62em/char); `cls: 'mono'` is what actually selects the mono stack, since
  // a CSS declaration from styleBlock outranks a presentation attribute.
  // Widths are read back from the primitive so layout can never disagree with it.
  const mk = (t, x) => pill({ x, y: Y_PILLS, text: t, mono: true, size: 11, cls: 'mono' });
  const widths = picked.map((t) => Number(/width="([0-9.]+)"/.exec(mk(t, CX))?.[1] ?? 0));

  const out = [];
  let x = CX;
  let used = 0;
  picked.forEach((t, i) => {
    const add = (i ? PILL_GAP : 0) + widths[i];
    if (used + add > LEFT_W) return;
    out.push(mk(t, x));
    x += widths[i] + PILL_GAP;
    used += add;
  });
  return out.join('');
}

/**
 * Quiet right-aligned meta on the title baseline: the languages the rail draws,
 * then the licence. The title keeps priority for the row, so the licence — the
 * least load-bearing fact on the card — is the first thing to step aside.
 */
function metaLine(data) {
  const langText = data.shares.map((s) => `${s.name} ${fmtPct(s.pct)}`).join(' \u00b7 ');
  if (!langText) return { svg: '', width: 0 };
  const withLicense = data.license ? `${langText} \u00b7 ${data.license}` : langText;
  const value = measure(withLicense, META_SIZE) <= META_BUDGET ? withLicense : langText;
  return {
    svg: text({ x: CX + LEFT_W, y: Y_TITLE, value, fill: 'var(--text3)', size: META_SIZE, anchor: 'end' }),
    width: measure(value, META_SIZE),
  };
}

/* -------------------------------------------------------------------- render */

/**
 * @param {object} data  data/stats.json (either the sync.mjs or fetch-stats.mjs shape)
 * @param {{scheme?: 'light'}} [opts]  omit for the shipped, scheme-following asset
 * @returns {{svg: string}}
 */
export function render(data, opts = {}) {
  const d = readData(data);
  const cls = rootClass(SCOPE, opts?.scheme);

  const statCells = [
    { value: fmtCount(d.stars), caption: 'STARS' },
    { value: fmtCount(d.commits), caption: 'COMMITS' },
    { value: `${fmtCount(d.buildDays)}d`, caption: 'BUILD SPAN' },
  ];

  const descLines = d.description ? wrap(d.description, LEFT_W, DESC_SIZE, DESC_MAX_LINES) : [];
  const meta = metaLine(d);
  // The name is measured against whatever the meta leaves, and cut at a real
  // ellipsis if it still does not fit — never allowed to run into the numbers.
  const titleText = fitEllipsis(d.name, LEFT_W - (meta.width ? meta.width + TITLE_META_GAP : 0), 26, true);

  const children = [
    styleBlock({ scope: SCOPE }),
    `<style>
    .${SCOPE} .project-marks{animation:project-rise 600ms ${EASE_OUT}}
    .${SCOPE} .project-mark{fill:var(--accent);stroke:none}
    .${SCOPE} .project-group:hover .project-mark{stroke:var(--line-strong);stroke-width:1}
    @keyframes project-rise{from{opacity:.35}to{opacity:1}}
  </style>`,

    panel({ x: PANEL.x, y: PANEL.y, w: PANEL.w, h: PANEL.h, r: PANEL.r }),
    languageRail(d),

    // identity
    text({ x: CX, y: Y_TITLE, value: titleText, fill: 'var(--text1)', size: 26, weight: 700, mono: true, ls: '-0.01em', cls: 'mono' }),
    meta.svg,

    ...descLines.map((line, i) => text({
      x: CX, y: Y_DESC + i * DESC_LEAD, value: line,
      fill: 'var(--text2)', size: DESC_SIZE,
    })),

    topicRow(d.topics),

    // evidence
    statCells.map((s, i) => stat({ x: RX + i * STAT_PITCH, y: Y_TITLE, value: s.value, caption: s.caption })).join(''),
    roundedRect({ x: WELL.x, y: WELL.y, w: WELL.w, h: WELL.h, r: WELL.r, fill: 'var(--bg2)' }),
    `<g class="project-marks">${device(d.buckets, d.commits)}</g>`,
  ];

  const share = d.shares.map((s) => `${s.name} ${fmtPct(s.pct)}`).join(' / ');
  const title = `${d.name} \u2014 featured project`;
  const desc = [
    `\u7cbe\u9009\u9879\u76ee\uff1a${d.name}\u3002`,
    d.description ? d.description + ' ' : '',
    `\u6570\u636e\uff1a${d.stars} stars \u00b7 ${d.commits} commits \u00b7 ${d.buildDays} \u5929`,
    d.rangeLabel ? `\uff08${d.rangeLabel}\uff09` : '',
    share ? ` \u00b7 ${share}` : '',
    d.license ? ` \u00b7 ${d.license}` : '',
    '\u3002',
  ].join('');

  return { svg: svgRoot({ w: FRAME_W, h: HEIGHT, title, desc, cls, children: children.join('\n  ') }) };
}

export default render;
