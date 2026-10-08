#!/usr/bin/env node
/**
 * Validate every generated asset against the rules in design-system.md.
 *
 * These are the checks that catch the failure modes GitHub's rendering exposes
 * late and silently: a stripped <script>, a rect with rx but no ry, text too
 * small to read at the profile column's real width, an id that collides when
 * two assets are inlined, a colour token that never resolves.
 *
 * Usage:
 *   node scripts/check.mjs [--assets assets] [--md README.md] [--json out.json]
 *
 * Exit code 1 if any ERROR is found. Warnings do not fail the build.
 */
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkXml } from './xml-lint.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const KIT = resolve(HERE, '..');

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
}
const ASSETS = resolve(process.cwd(), arg('assets', join(KIT, 'assets')));
const MD = resolve(process.cwd(), arg('md', join(KIT, 'README.md')));
const JSON_OUT = arg('json', null);

/** Tokens that must exist in tokens.mjs for a `var(--x)` reference to resolve. */
const KNOWN_TOKENS = new Set([
  'bg0', 'bg1', 'bg2', 'line', 'line-strong', 'text1', 'text2', 'text3',
  'accent', 'accent-2', 'good', 'warn',
  /* The INKWARD palette, used by the hero and the work list. */
  'paper', 'paper-2', 'ink', 'ink-2', 'ink-3', 'rule', 'acid',
]);

/**
 * The CSS scope each asset uses, when it differs from the output file stem.
 *
 * A generator picks its own scope. hero2 renders assets/hero.svg under the scope
 * `hero2` (the file is named for where it appears, the scope for what made it),
 * and assets/work.svg under `work`. Deriving the scope from the filename made
 * the variant check report a failure that was not real.
 */
const SCOPE_BY_NAME = { hero: 'hero2' };

/** Assets that no longer exist; listing them here keeps the checks honest. */
const RETIRED = new Set(['project']);

const errors = [];
const warnings = [];
const notes = [];

function err(file, msg) { errors.push(`${file}: ${msg}`); }
function warn(file, msg) { warnings.push(`${file}: ${msg}`); }

/* ------------------------------------------------------------- svg checks */

function checkSvg(file, svg, opts = {}) {
  const isLight = /-light\.svg$/.test(file);
  const label = file;

  /* XML well-formedness FIRST. Everything below assumes the document parses;
     a malformed attribute makes the file render only up to the error, and no
     regex-based check can see that. */
  const xml = checkXml(svg);
  if (!xml.ok) {
    err(label, `NOT WELL-FORMED XML — ${xml.error}`);
    return { bytes: Buffer.byteLength(svg, 'utf8'), isLight, fatal: true };
  }
  if (xml.root !== 'svg') err(label, `root element is <${xml.root}>, expected <svg>`);

  /* Structure */
  if (!/^<svg[\s>]/.test(svg.trim())) err(label, 'does not start with <svg>');
  for (const attr of ['xmlns="http://www.w3.org/2000/svg"', 'viewBox=', 'role="img"', 'width=', 'height=']) {
    if (!svg.includes(attr)) err(label, `missing required root attribute ${attr}`);
  }
  if (!/<title[\s>]/.test(svg)) err(label, 'missing <title> (accessibility contract)');
  if (!/<desc[\s>]/.test(svg)) err(label, 'missing <desc> (accessibility contract)');

  /* JavaScript and remote references — all forbidden. */
  if (/<script[\s>]/i.test(svg)) err(label, 'contains <script> — GitHub strips it and it cannot run in an <img>');
  if (/\son[a-z]+\s*=/i.test(svg)) err(label, 'contains an inline event handler (on*=)');
  if (/<foreignObject[\s>]/i.test(svg)) err(label, 'contains <foreignObject> — not rendered by the image proxy');
  if (/@import\b/.test(svg)) err(label, 'contains @import — external fetch is blocked');
  if (/<image[\s>][^>]*href\s*=\s*["']https?:/i.test(svg)) err(label, 'references an external <image>');
  if (/<use[\s>][^>]*href\s*=\s*["']https?:/i.test(svg)) err(label, 'references an external <use>');
  if (/<style[^>]*>[\s\S]*?url\(\s*["']?https?:/i.test(svg)) err(label, 'CSS references a remote URL');

  /* rx without ry — the classic cross-renderer corner bug. */
  const rects = svg.match(/<rect\b[^>]*>/g) ?? [];
  for (const r of rects) {
    const hasRx = /\brx\s*=/.test(r);
    const hasRy = /\bry\s*=/.test(r);
    if (hasRx !== hasRy) {
      err(label, `<rect> sets ${hasRx ? 'rx' : 'ry'} without the other: ${r.slice(0, 90)}`);
    }
  }
  notes.push(`${label}: ${rects.length} rect(s), all rx/ry paired`);

  /* var(--token) references must resolve.
   *
   * This check exists because of a bug that shipped: a palette key was emitted as
   * `--ink2` while every reference said `var(--ink-2)`. An unresolvable var() in
   * an SVG presentation attribute does NOT fall back to the inherited value or to
   * transparent — it takes the property's INITIAL value. So every secondary text
   * run painted solid BLACK on the near-black plate, and because black on cream is
   * perfectly legible, the light theme hid it completely through several review
   * passes. Review the DARK variant first: it is the only one where a missing
   * token is visible at all. */
  const used = new Set();
  for (const m of svg.matchAll(/var\(\s*--([a-z0-9-]+)/gi)) used.add(m[1].toLowerCase());
  // Tokens defined in this file itself (styleBlock emits them) are fine.
  const defined = new Set();
  for (const m of svg.matchAll(/--([a-z0-9-]+)\s*:/gi)) defined.add(m[1].toLowerCase());
  for (const t of used) {
    if (!KNOWN_TOKENS.has(t) && !defined.has(t)) {
      err(label, `uses var(--${t}) which is neither a known token nor defined in the file — it will paint the INITIAL value (usually black), not fall back`);
    }
  }
  if (used.size) notes.push(`${label}: ${used.size} var() token(s), all resolve`);

  /* Theme support. Two legitimate shapes:
     - a self-theming single file: it MUST carry the light media query
     - one member of a <picture> pair: it MUST NOT, or its theme would depend on
       the reader's OS instead of on GitHub's <picture> selection */
  const hasLightMedia = /prefers-color-scheme\s*:\s*light/.test(svg);
  if (opts.singleTheme) {
    if (hasLightMedia) {
      err(label, `carries a prefers-color-scheme media query, but it is the ${opts.singleTheme} member of a pair — <picture> selects it, so it must be single-theme`);
    }
    // And it must actually BE that theme, or the pair is decorative.
    const wantLight = opts.singleTheme === 'light';
    const isLight = /#f2efe9/i.test(svg);
    const isDark = /#0a0d14/i.test(svg);
    if (wantLight && !isLight) err(label, 'named -light but does not carry the light paper token');
    if (!wantLight && !isDark) err(label, 'named -dark but does not carry the dark paper token');
  } else if (!hasLightMedia) {
    err(label, 'no @media (prefers-color-scheme: light) block — a self-theming asset needs one');
  }
  if (!/prefers-reduced-motion\s*:\s*reduce/.test(svg)) {
    err(label, 'no @media (prefers-reduced-motion: reduce) block — mandatory per design-system §4');
  }

  /* Scoped ids, so two inlined assets cannot collide. */
  const ids = [...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const refs = new Set([...svg.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]));
  /* Scope label for id-prefix checks: strip the extension only. */
  /* The scope a generator chose may differ from its output stem — see
     SCOPE_BY_NAME. Strip the -dark/-light pair suffix first: the scope is the
     asset's, not the file's. */
  const stem = file.replace(/\.svg$/, '');
  const base = stem.replace(/-(dark|light)$/, '');
  const scope = SCOPE_BY_NAME[base] ?? base;
  for (const id of ids) {
    if (id === 't' || id === 'd') continue; // svgRoot's title/desc ids
    if (!id.startsWith(scope)) {
      warn(label, `element id "${id}" is not prefixed with the asset scope "${scope}"`);
    }
  }
  for (const r of refs) {
    if (!ids.includes(r)) err(label, `url(#${r}) references an id that does not exist`);
  }

  /* Font sizes: nothing below the legibility floor. */
  const sizes = [];
  for (const m of svg.matchAll(/font-size\s*[:=]\s*["']?([0-9.]+)/g)) sizes.push(parseFloat(m[1]));
  const tooSmall = sizes.filter((s) => s < 11);
  if (tooSmall.length) {
    err(label, `${tooSmall.length} text run(s) below the 11-unit legibility floor: ${[...new Set(tooSmall)].join(', ')}`);
  }
  if (sizes.length) {
    notes.push(`${label}: font sizes ${Math.min(...sizes)}–${Math.max(...sizes)}`);
  }

  /* Colour scheme is never the only carrier of meaning — heuristic: an asset
     that draws heat cells must also expose text or titles per cell. */
  if (/heat|contrib|activity|cell/i.test(svg) && !/<title>/.test(svg)) {
    warn(label, 'looks like a data grid but has no per-item <title> tooltips');
  }

  /* Size guard: GitHub renders fine, but huge SVGs slow the page down. */
  const bytes = Buffer.byteLength(svg, 'utf8');
  if (bytes > 400_000) warn(label, `large asset (${(bytes / 1024).toFixed(0)} KB) — consider trimming`);
  notes.push(`${label}: ${(bytes / 1024).toFixed(1)} KB`);

  /* The light preview variant must actually differ. */
  return { bytes, isLight };
}

/**
 * A forced-light variant must not be byte-identical to the default one.
 * @param {string} name  registry name — also the preview pair's stem
 * @param {string} dir   assets directory
 * @param {string} [fileName] the shipped file, when it is not `<name>.svg`
 */
function checkVariantPair(name, dir, fileName = `${name}.svg`) {
  const d = join(dir, 'preview', `${name}-dark.svg`);
  const l = join(dir, 'preview', `${name}-light.svg`);
  const shipped = join(dir, fileName);
  const scope = SCOPE_BY_NAME[name] ?? name;

  /* Preview variants are local-only (they are gitignored in the deployed repo),
     so their absence is only informational when running in CI. */
  const previewDirExists = existsSync(join(dir, 'preview'));
  if (!existsSync(d) || !existsSync(l)) {
    const note = previewDirExists
      ? `preview pair incomplete for ${name} — run node build.mjs`
      : `previews not generated in this checkout (CI): theme verified locally`;
    notes.push(note);
    if (!existsSync(shipped)) err(name, `missing shipped asset ${fileName}`);
    return;
  }

  const a = readFileSync(d, 'utf8');
  const b = readFileSync(l, 'utf8');
  if (a === b) {
    err(name, 'preview dark and light variants are byte-identical — the forced scheme is not being applied');
  }

  /* Look at the root element's class attribute, not the whole file: the
     generated CSS legitimately *defines* `.<scope>-light.<scope>` in every
     variant, so a naive substring search matches the default file too. */
  const rootClassOf = (svg) => /<svg\b[^>]*\sclass="([^"]*)"/.exec(svg)?.[1] ?? '';
  const clsDark = rootClassOf(a);
  const clsLight = rootClassOf(b);
  if (!new RegExp(`(^|\\s)${scope}-light(\\s|$)`).test(clsLight)) {
    err(name, `forced-light preview root class is "${clsLight}" — expected it to include "${scope}-light"`);
  }
  if (new RegExp(`(^|\\s)${scope}-light(\\s|$)`).test(clsDark)) {
    err(name, `default preview root class is "${clsDark}" — it must not carry the -light scope`);
  }
  if (!new RegExp(`(^|\\s)${scope}(\\s|$)`).test(clsDark)) {
    warn(name, `default preview root class is "${clsDark}" — expected it to include the scope "${scope}"`);
  }

  // The shipped asset is the default render, so it must equal the dark preview.
  if (existsSync(shipped)) {
    if (readFileSync(shipped, 'utf8') !== a) {
      err(name, `shipped ${fileName} differs from preview/${name}-dark.svg — they must be the same render`);
    }
  } else {
    err(name, `missing shipped asset ${fileName}`);
  }
}

/* ---------------------------------------------------------- noise mirror -- */

/**
 * `lib/noise.mjs` is a copy of `portfolio/src/noise.js`.
 *
 * The copy exists because the profile repository is deployed alone and CI runs
 * the generators there, so an import reaching outside the repo fails the build
 * outright ("Cannot find module"). A copy that silently drifts would mean CI
 * renders DIFFERENT artwork from the workspace, which is worse than the problem
 * it solves — so the two are compared here, on exported names AND on the bodies.
 */
function checkNoiseMirror() {
  const a = join(KIT, 'lib', 'noise.mjs');
  const b = join(KIT, '..', 'portfolio', 'src', 'noise.js');
  if (!existsSync(a)) { err('lib/noise.mjs', 'missing — the generators import it'); return; }
  if (!existsSync(b)) {
    notes.push('portfolio/src/noise.js not in this checkout; mirror not compared');
    return;
  }

  const read = (p) => readFileSync(p, 'utf8');
  const names = (src) => [...src.matchAll(/export\s+(?:function|const)\s+([A-Za-z0-9_]+)/g)]
    .map((m) => m[1]).sort().join(',');

  const na = names(read(a));
  const nb = names(read(b));
  if (na !== nb) {
    err('lib/noise.mjs', `exports [${na}] but portfolio/src/noise.js exports [${nb}] — the mirror has drifted`);
    return;
  }
  notes.push(`noise mirror exports match the site: ${na}`);

  /* Compare bodies too: a changed threshold or octave count keeps the same names
     and would silently make CI's artwork differ from the workspace's. */
  const body = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('')
    .replace(/\s+/g, '');
  if (body(read(a)) !== body(read(b))) {
    warn('lib/noise.mjs', 'body differs from portfolio/src/noise.js — CI would render different artwork than the workspace');
  }
}

/* ---------------------------------------------------------- readme checks */

function checkReadme() {
  if (!existsSync(MD)) { warn('README.md', 'not found — skipping'); return; }
  const md = readFileSync(MD, 'utf8');

  if (/<style[\s>]/i.test(md)) {
    err('README.md', 'contains <style> — GitHub strips it from Markdown');
  }
  if (/<script[\s>]/i.test(md)) {
    err('README.md', 'contains <script> — GitHub strips it from Markdown');
  }

  /* Every referenced asset must exist on disk. */
  const refs = [...md.matchAll(/(?:srcset|src)="([^"#\s]+)"/g)]
    .map((m) => m[1])
    .filter((r) => !/^https?:/.test(r));
  for (const r of new Set(refs)) {
    const p = join(KIT, r);
    if (!existsSync(p)) err('README.md', `references ${r} which does not exist`);
  }
  notes.push(`README.md: ${new Set(refs).size} local image reference(s), all resolved`);

  /* Collapse-prone raw HTML: a blank line inside <picture>/<div> breaks it. */
  const blocks = md.split(/\n\s*\n/);
  for (const b of blocks) {
    if (/<picture>/.test(b) && !/<\/picture>/.test(b)) {
      warn('README.md', 'a <picture> block is split by a blank line — GitHub may render it as text');
    }
    if (/<div\b/.test(b) && !/<\/div>/.test(b)) {
      warn('README.md', 'a <div> block is split by a blank line — GitHub may render it as text');
    }
    if (/<details\b/.test(b) && !/<\/details>/.test(b) && !/<summary/.test(b)) {
      warn('README.md', 'a <details> block may be split by a blank line');
    }
  }

  /* Dark/light handling. A single self-theming SVG is the intended design, so
     the only real failure is an asset that cannot follow the reader's theme —
     which checkSvg already reports.
     <picture> is the officially documented mechanism (GitHub Docs: "The
     <picture> HTML element is supported") and is actively enhanced by GitHub,
     which rewrites the active <source media> at runtime. Verified against
     GitHub's own rendering pipeline by scripts/oracle.mjs. The
     #gh-*-mode-only fragment pair is the legacy alternative and is not used.
     One real trap: GitHub gives <picture> children no `max-width: 100%`, so a
     wide image there MUST carry an explicit width or it overflows the column. */
  const pictureBlocks = md.match(/<picture>[\s\S]*?<\/picture>/g) ?? [];
  for (const [i, block] of pictureBlocks.entries()) {
    if (!/<source\b[^>]*media=/.test(block)) {
      err('README.md', `<picture> #${i + 1} has no <source media=...> — it cannot switch theme`);
    }
    if (!/media="\(prefers-color-scheme: dark\)"/.test(block)) {
      warn('README.md', `<picture> #${i + 1}: write the media query exactly as "(prefers-color-scheme: dark)" — GitHub string-matches that spelling`);
    }
    const img = /<img\b[^>]*>/.exec(block)?.[0] ?? '';
    if (!/\bwidth=/.test(img)) {
      err('README.md', `<picture> #${i + 1} <img> has no width= — GitHub applies no max-width inside <picture>, so it will overflow the column`);
    }
    if (!/\bheight=/.test(img)) {
      warn('README.md', `<picture> #${i + 1} sets width without height — a height avoids layout shift`);
    }
  }
  /* A bare <img> (one GitHub will auto-wrap in a link) is only a problem outside
     <picture>, so strip the picture blocks before looking. */
  const outsidePicture = md.replace(/<picture>[\s\S]*?<\/picture>/g, '');
  const bareImgs = (outsidePicture.match(/<img\b/g) ?? []).length;
  if (bareImgs) {
    warn('README.md', `${bareImgs} bare <img> outside <picture> — GitHub auto-wraps those in <a href="<img src>">, so clicking opens the raw SVG`);
  }
  notes.push(`README.md: ${pictureBlocks.length} <picture> block(s), dark/light handled inside the SVG`);

  /* Link sanity: relative links must not escape the repo. */
  for (const m of md.matchAll(/\]\((?!https?:|#|mailto:)([^)]+)\)/g)) {
    warn('README.md', `relative link "${m[1]}" — make sure it resolves in the profile repo`);
  }
}

/* -------------------------------------------------------------------- main */

function main() {
  if (!existsSync(ASSETS)) {
    console.error(`no assets directory at ${ASSETS} — run: node build.mjs`);
    process.exit(1);
  }
  const svgs = readdirSync(ASSETS).filter((f) => f.endsWith('.svg'));
  if (!svgs.length) {
    console.error(`no .svg files in ${ASSETS} — run: node build.mjs`);
    process.exit(1);
  }

  console.log(`checking ${svgs.length} asset(s) in ${ASSETS}\n`);
  /* A file whose name ends -dark.svg / -light.svg is one member of a pair and
     must be SINGLE-THEME: it is selected by <picture>, not by a media query, so
     carrying one would make its theme depend on the reader's OS again. */
  for (const f of svgs.sort()) {
    const svg = readFileSync(join(ASSETS, f), 'utf8');
    const m = /-(dark|light)\.svg$/.exec(f);
    checkSvg(f, svg, m ? { singleTheme: m[1] } : {});
  }

  /* Assets shipped as a real dark/light FILE PAIR for <picture>. The critical
     assertion is that the two files differ: a pair whose members are identical
     means the theme is not actually being forced, which is exactly the failure
     that put a light hero on a dark profile page. */
  for (const [name, base] of [['hero', 'hero'], ['work', 'work']]) {
    const d = join(ASSETS, `${base}-dark.svg`);
    const l = join(ASSETS, `${base}-light.svg`);
    if (!existsSync(d) || !existsSync(l)) {
      err(name, `missing the ${base}-dark.svg / ${base}-light.svg pair — the README's <picture> needs both`);
      continue;
    }
    const a = readFileSync(d, 'utf8');
    const b = readFileSync(l, 'utf8');
    if (a === b) {
      err(name, `${base}-dark.svg and ${base}-light.svg are byte-identical — the theme is not being forced, so <picture> has nothing to switch between`);
    }
    if (/prefers-color-scheme\s*:\s*light/.test(a) || /prefers-color-scheme\s*:\s*light/.test(b)) {
      err(name, `a paired file still carries a prefers-color-scheme media query — each must be single-theme or the file's theme depends on the reader's OS again`);
    }
    notes.push(`${name}: pair differs, both single-theme (${(a.length / 1024).toFixed(0)} KB / ${(b.length / 1024).toFixed(0)} KB)`);
  }

  /* Assets that theme themselves in one file. */
  for (const [name, fileName] of [
    ['matrix', 'matrix.svg'],
    ['activity', 'activity.svg'],
  ]) {
    if (RETIRED.has(name)) continue;
    checkVariantPair(name, ASSETS, fileName);
  }
  checkReadme();
  checkNoiseMirror();

  console.log('notes:');
  for (const n of notes) console.log('  · ' + n);
  if (warnings.length) {
    console.log('\nwarnings:');
    for (const w of warnings) console.log('  ! ' + w);
  }
  if (errors.length) {
    console.log('\nERRORS:');
    for (const e of errors) console.log('  ✗ ' + e);
  }

  const summary = { errors, warnings, notes, checkedAt: new Date().toISOString() };
  if (JSON_OUT) writeFileSync(resolve(process.cwd(), JSON_OUT), JSON.stringify(summary, null, 2) + '\n');

  console.log(`\n${errors.length} error(s), ${warnings.length} warning(s)`);
  process.exit(errors.length ? 1 : 0);
}

main();
