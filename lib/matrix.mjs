/**
 * matrix.mjs — the engineering-substance panel: *why* a turn ended.
 *
 * The subject is `dsh-notify-cues`, which reads the end reason out of DSH's own
 * `turn/end` session event instead of guessing "done" from `agent/status → idle`.
 * The panel shows the seven real branches of that decision, one row each, so the
 * interesting part (an `aborted` turn is three different things, one of which is
 * deliberately silent) is visible without reading a paragraph.
 *
 * Sources, read rather than remembered:
 *   dsh-notify-cues/lib/index.js  lines 108-131  the `reason.kind` switch
 *   dsh-notify-cues/lib/index.js  lines 133-151  the real zh/en notification copy
 *   dsh-notify-cues/lib/notify.ps1 lines 39-44   the synthesised tone table
 *
 * The contour marks are not decorative: every note rectangle is computed from
 * the tone table — x is the note's real onset and duration in ms on one shared
 * time axis, y is its pitch in semitones. Three short pips with rests between
 * them and a flat double knock look different because they *are* different.
 *
 * Composed entirely from lib/primitives.mjs. Pure ESM, zero deps, deterministic.
 */

import { PAD, RADIUS, EASE_OUT, T_FAST, styleBlock, rootClass } from '../tokens.mjs';
import {
  svgRoot, panel, roundedRect, rule, label, text, accentTick, esc,
} from './primitives.mjs';

/* ------------------------------------------------------------------ canvas */

export const MATRIX_W = 1100;
export const MATRIX_H = 252;

const PANEL = { x: PAD, y: PAD, w: MATRIX_W - PAD * 2, h: MATRIX_H - PAD * 2 }; // 28,28,1044,196

const CONTENT_L = 48;   // panel inner padding: 20 on every side
const CONTENT_R = 1032;

/** Left block: the claim + the shared detail well. */
const WELL = { x: CONTENT_L, y: 112, w: 352, h: 98 }; // ends exactly on the row grid's floor
const WELL_LABEL_X = 64;
const WELL_VALUE_X = 152;
const WELL_LINE_Y = [137, 155, 173, 191];
const EYEBROW_Y = 56;
const HEAD_Y = 80;
const SUB_Y = 98;

/** Right block: the matrix. Seven rows, a strict 20-unit baseline grid. */
const RULE_Y = 66;
const ROW_TOP = 70;
const ROW_H = 20;
const ROW_BASELINE = 15;   // within the row band
const RIGHT_L = 432;
const RIGHT_R = CONTENT_R;
const TICK_X = 436;
const COL_KEY = 450;
const COL_OUTCOME = 664;
const COL_CURVE = 758;
const COL_SIGNAL = 858;
const LANE_W = 88;         // 758 .. 846, then a 12-unit gutter before SIGNAL

/* --------------------------------------------------------------- the sound */

/**
 * Tone table, mirrored from dsh-notify-cues/lib/notify.ps1 lines 39-44.
 * Each entry is [frequency in Hz, duration in ms]; `0` Hz is an explicit rest,
 * which matters: `maxTokens` is three pips *separated* by rests, and `error`
 * has a rest between its two notes.
 */
const TONES = {
  completed: [[587.33, 110], [880.0, 190]],
  interrupted: [[880.0, 90], [440.0, 170]],
  error: [[277.18, 130], [0, 40], [207.65, 240]],
  maxTokens: [[1046.5, 65], [0, 45], [1046.5, 65], [0, 45], [1046.5, 65]],
  blocked: [[392.0, 150], [392.0, 150]],
  attention: [[659.25, 95], [783.99, 95], [987.77, 200]],
};

const PX_PER_SEMITONE = 1;  // honest interval scale: a 7-semitone rise is 7 units deep
const LANE_TOP = 2;         // bar-top offset inside the row band
const LANE_TRAVEL = 13;     // + BAR_H = 16 of the 20-unit row, so nothing touches
const BAR_H = 3;
const LEGATO_GAP = 1.5;     // split consecutive same-pitch notes so repeats read as repeats

const maxTotalMs = Math.max(
  ...Object.values(TONES).map((tone) => tone.reduce((sum, [, ms]) => sum + ms, 0)),
); // 410 — error
const MS_SCALE = LANE_W / maxTotalMs;

/**
 * The seven rows, in source order of the switch: `completed`, the three ways
 * `aborted` resolves, then the top-level kinds, then the one signal that does
 * not come from `turn/end` at all.
 *
 * `key` / `dim` are the real identifiers, quoted exactly. `dim` carries the
 * nested cause (`·`) and the disjunctive inputs (`|`).
 */
const ROWS = [
  {
    key: 'completed',
    dim: null,
    outcome: '任务完成',
    signal: 'D5→A5 rising pair',
    tone: TONES.completed,
    tip: [
      ['reason.kind', "'completed'"],
      ['scene', "'completed'"],
      ['chime', '587.33 → 880.00 Hz · 300 ms'],
    ],
  },
  {
    key: 'aborted',
    dim: '·user',
    outcome: '已中断',
    signal: 'A5→A4 falling, cut short',
    tone: TONES.interrupted,
    tip: [
      ['reason.kind', "'aborted'"],
      ['cause', "'user'"],
      ['scene', "'interrupted'"],
      ['chime', '880.00 → 440.00 Hz · 260 ms'],
    ],
  },
  {
    key: 'aborted',
    dim: '·hook | blocked',
    outcome: '已被阻止',
    signal: 'flat double knock',
    tone: TONES.blocked,
    tip: [
      ['reason.kind', "'aborted' | 'blocked'"],
      ['cause', "'hook'"],
      ['scene', "'blocked'"],
      ['chime', '392.00 Hz ×2 · 300 ms'],
    ],
  },
  {
    key: 'aborted',
    dim: '·parent | disposed',
    outcome: '静默',
    signal: 'deliberately silent',
    tone: [],
    tip: [
      ['reason.kind', "'aborted'"],
      ['cause', "'parent' | 'disposed'"],
      ['scene', 'none — returns undefined'],
      ['chime', 'none'],
    ],
  },
  {
    key: 'error',
    dim: null,
    outcome: '出错了',
    signal: 'low, dissonant, falling',
    tone: TONES.error,
    tip: [
      ['reason.kind', "'error'"],
      ['scene', "'error'"],
      ['chime', '277.18 → 207.65 Hz · 410 ms'],
    ],
  },
  {
    key: 'max-tokens',
    dim: null,
    outcome: '达到输出上限',
    signal: 'three sharp pips',
    tone: TONES.maxTokens,
    tip: [
      ['reason.kind', "'max-tokens'"],
      ['scene', "'max-tokens'"],
      ['chime', '1046.50 Hz ×3 · 285 ms'],
    ],
  },
  {
    key: 'approval/asked',
    dim: null,
    outcome: '需要你操作',
    signal: 'E5-G5-B5 arpeggio',
    tone: TONES.attention,
    tip: [
      ['event.type', "'approval/asked'"],
      ['scene', "'attention'"],
      ['chime', '659.25 → 987.77 Hz · 390 ms'],
    ],
  },
];

/** What the well shows before anything is hovered: the contract, not a blank box. */
const DEFAULT_TIP = [
  ['event', "session/event 'turn/end'"],
  ['field', 'data.reason.kind'],
  ['type', 'TurnEndReasonMap'],
  ['default', 'unknown kind → silent'],
];

/* ------------------------------------------------------------------ pieces */

/** MIDI note number of a frequency, A4 = 440 Hz. */
function midi(hz) {
  return 69 + 12 * Math.log2(hz / 440);
}

/**
 * One row's sound mark, drawn as a piano-roll fragment so the shape is the
 * datum: pitch is height, time runs left to right on a shared axis.
 */
function contour(rowTop, tone) {
  if (tone.length === 0) {
    // The silent branch: no accent at all, only the flat line that marks it.
    return rule({
      x: COL_CURVE, y: rowTop + 10, w: LANE_W,
      stroke: 'var(--text3)', dash: '3 4', cls: 'matrix-quiet',
    });
  }

  const first = midi(tone[0][0]);
  const rel = tone.map(([hz]) => (hz > 0 ? midi(hz) - first : null));
  const sounding = rel.filter((r) => r !== null);
  const hi = Math.max(...sounding);
  const lo = Math.min(...sounding);
  const span = (hi - lo) * PX_PER_SEMITONE;
  const top = rowTop + LANE_TOP + (LANE_TRAVEL - span) / 2;

  let clock = 0;
  const bars = [];
  tone.forEach(([hz, ms], i) => {
    const x = clock * MS_SCALE;
    const w = ms * MS_SCALE;
    clock += ms;
    if (hz <= 0) return; // an explicit rest is a gap, not a mark
    // Consecutive notes touch; pull the earlier one back a hair so a repeated
    // pitch still reads as two events. Onsets stay exact.
    const cut = i + 1 < tone.length && tone[i + 1][0] > 0 ? LEGATO_GAP : 0;
    bars.push(roundedRect({
      x: COL_CURVE + x,
      y: top + (hi - rel[i]) * PX_PER_SEMITONE,
      w: Math.max(4, w - cut),
      h: BAR_H,
      r: BAR_H / 2,
      fill: 'var(--accent)',
      cls: 'matrix-note',
    }));
  });
  return `<g aria-hidden="true">${bars.join('')}</g>`;
}

/** One hoverable row: band, pointer, key, outcome, contour, signal word. */
function rowSvg(row, i) {
  const top = ROW_TOP + i * ROW_H;
  const base = top + ROW_BASELINE;
  const dimX = COL_KEY + (row.key.length + 1) * 12 * 0.62; // upper-bound mono advance
  const keyCls = row.tone.length === 0 ? 'matrix-key matrix-mute' : 'matrix-key';

  return `<g class="matrix-row matrix-r${i}">
    <title>${esc(`reason.kind ${row.key}${row.dim ? ' ' + row.dim : ''} → ${row.signal}`)}</title>
    ${roundedRect({
      x: RIGHT_L, y: top, w: RIGHT_R - RIGHT_L, h: ROW_H, r: 0,
      fill: 'var(--accent)', cls: 'matrix-tint', extra: 'fill-opacity="0.08" aria-hidden="true"',
    })}
    ${accentTick({ x: TICK_X, y: top + 4, h: 12, cls: 'matrix-tick' })}
    ${text({ x: COL_KEY, y: base, value: row.key, size: 12, mono: true, cls: keyCls })}
    ${row.dim ? text({ x: dimX, y: base, value: row.dim, size: 12, mono: true, fill: 'var(--text2)' }) : ''}
    ${text({ x: COL_OUTCOME, y: base, value: row.outcome, size: 12, fill: 'var(--text2)' })}
    ${contour(top, row.tone)}
    ${text({ x: COL_SIGNAL, y: base, value: row.signal, size: 11, mono: true, fill: 'var(--text2)' })}
  </g>`;
}

/** A tip layer: the same field/value grid for every row, so the swap never jumps. */
function tipSvg(cls, pairs) {
  const body = pairs.map(([k, v], i) => [
    text({ x: WELL_LABEL_X, y: WELL_LINE_Y[i], value: k, size: 11, mono: true, fill: 'var(--text2)' }),
    text({ x: WELL_VALUE_X, y: WELL_LINE_Y[i], value: v, size: 11, mono: true, fill: 'var(--text1)' }),
  ].join('')).join('');
  return `<g class="matrix-tip ${cls}">${body}</g>`;
}

/* -------------------------------------------------------------------- css */

function css() {
  const hoverTips = ROWS
    .map((_, i) => `.matrix .matrix-row.matrix-r${i}:hover ~ .matrix-tips .matrix-t${i}{opacity:1 !important}`)
    .join('\n    ');
  // `!important` + higher specificity than styleBlock's reduced-motion reset
  // (`.matrix *{opacity:1 !important}`), which would otherwise reveal every
  // tooltip layer at once for readers who ask for less motion.
  return `<style>
    .matrix .matrix-tint,.matrix .matrix-tick{opacity:0 !important}
    .matrix .matrix-note{opacity:.6 !important}
    .matrix .matrix-quiet{opacity:.55 !important}
    .matrix .matrix-tip{opacity:0 !important}
    .matrix .matrix-tip.matrix-def{opacity:1 !important}
    .matrix .matrix-row:hover .matrix-tint,.matrix .matrix-row:hover .matrix-tick{opacity:1 !important}
    .matrix .matrix-row:hover .matrix-note{opacity:1 !important}
    .matrix .matrix-row:hover .matrix-quiet{opacity:.95 !important}
    .matrix .matrix-row:hover ~ .matrix-tips .matrix-def{opacity:0 !important}
    ${hoverTips}
    .matrix .matrix-key{fill:var(--text1);transition:fill ${T_FAST} ${EASE_OUT}}
    .matrix .matrix-mute{fill:var(--text2)}
    .matrix .matrix-row:hover .matrix-mute{fill:var(--text1)}
    .matrix .matrix-tint,.matrix .matrix-tick,.matrix .matrix-note,.matrix .matrix-quiet,
    .matrix .matrix-tip{transition:opacity ${T_FAST} ${EASE_OUT}}
  </style>`;
}

/* ----------------------------------------------------------------- render */

/**
 * @param {object} [data]  stats.json: `featured.name` (or `repos[0].name`) names
 *                         the project. No repo at all is a valid, complete panel.
 * @param {object} [opts]
 * @param {'light'|'dark'} [opts.scheme]  force a theme for a preview build only.
 * @returns {{ svg: string }}
 */
export function render(data, opts = {}) {
  const scope = 'matrix';
  const cls = rootClass(scope, opts?.scheme);
  // stats.json carries the featured repo twice; accept either shape, and render
  // the same complete panel when there is no repo at all (the zero state).
  const repo = data?.featured?.name ?? data?.repos?.[0]?.name ?? null;

  const children = [
    `<rect width="${MATRIX_W}" height="${MATRIX_H}" fill="var(--bg0)"/>`,
    panel(PANEL),

    /* left block — the claim */
    label({ x: CONTENT_L, y: EYEBROW_Y, text: 'WHY A TURN ENDED' }),
    repo ? text({
      x: WELL.x + WELL.w, y: EYEBROW_Y, value: repo,
      fill: 'var(--text3)', size: 11, mono: true, anchor: 'end',
    }) : '',
    text({ x: CONTENT_L, y: HEAD_Y, value: '七种结束的理由，六种声音，一种沉默。', size: 15, weight: 600 }),
    text({
      x: CONTENT_L, y: SUB_Y, value: 'Seven reasons a turn ends. Six chimes, one silence.',
      fill: 'var(--text2)', size: 11.5,
    }),

    /* left block — the shared detail well, fed by :hover on the rows */
    roundedRect({ ...WELL, r: RADIUS, fill: 'var(--bg2)' }),

    /* right block — the schema */
    label({ x: COL_KEY, y: EYEBROW_Y, text: 'REASON' }),
    label({ x: COL_OUTCOME, y: EYEBROW_Y, text: 'OUTCOME' }),
    label({ x: COL_CURVE, y: EYEBROW_Y, text: 'CONTOUR' }),
    label({ x: COL_SIGNAL, y: EYEBROW_Y, text: 'SIGNAL' }),
    rule({ x: RIGHT_L, y: RULE_Y, w: RIGHT_R - RIGHT_L }),

    /* right block — rows, then the single shared tip layer they drive */
    `<g class="matrix-stage">${ROWS.map(rowSvg).join('')}<g class="matrix-tips" pointer-events="none">${
      tipSvg('matrix-def', DEFAULT_TIP) + ROWS.map((r, i) => tipSvg(`matrix-t${i}`, r.tip)).join('')
    }</g></g>`,
  ].filter(Boolean).join('\n  ');

  const svg = svgRoot({
    w: MATRIX_W,
    h: MATRIX_H,
    cls,
    title: repo
      ? `dsh-notify-cues：为什么这一轮结束了 — ${repo} 的 reason → signal 映射`
      : '为什么这一轮结束了 — 七种结束理由对应六种提示音',
    desc: '七种结束理由映射到六种提示音，全部取自 DSH 的 turn/end 事件里的 reason.kind：'
      + 'completed 上升、aborted·user 下降、aborted·hook 或 blocked 两声平响、error 低而下降、'
      + 'max-tokens 三声急促、approval/asked 琶音；aborted·parent|disposed 故意保持安静。'
      + '悬停任意一行，左侧会显示这一行的真实字段与音高。',
    children: `${styleBlock({ scope })}\n  ${css()}\n  ${children}`,
  });

  return { svg };
}
