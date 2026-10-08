#!/usr/bin/env node
/**
 * Build every SVG asset from data/stats.json.
 *
 * Usage:
 *   node build.mjs [--data data/stats.json] [--out assets] [--check]
 *
 * For each registered asset this writes:
 *   assets/<name>.svg               shipped — one file, themes itself
 *   assets/preview/<name>-dark.svg  forced-dark variant, for local screenshots
 *   assets/preview/<name>-light.svg forced-light variant, for local screenshots
 *
 * Why one shipped file and not a dark/light pair: the `#gh-dark-mode-only` /
 * `#gh-light-mode-only` fragment convention exists for images that *cannot*
 * theme themselves (PNGs, third-party badges). These assets carry their own
 * `@media (prefers-color-scheme: light)` block, so a single file already
 * follows the reader's system theme — with no guess about which theme they are
 * on and no second file to keep in sync. The preview pair exists only because a
 * screenshot cannot change its own OS preference; see scripts/check.mjs.
 *
 * Failures are loud: a missing or throwing generator fails the build rather
 * than silently emitting a stale asset.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
}
const DATA = resolve(HERE, arg('data', 'data/stats.json'));
const COPY = resolve(HERE, arg('copy', 'data/copy.json'));
const OUT = resolve(HERE, arg('out', 'assets'));
/** The kit root, used to rewrite the work rows in README.md in place. */
const KIT = HERE;

/** The asset registry. Order here is the order assets appear in the README. */
/**
 * The asset registry.
 *
 * Two generator shapes exist and both are legitimate:
 *   - `render(data, opts)`  one file that themes itself -> assets/<name>.svg
 *   - `renderWork(data, opts)` plus `markdown(data)`, used by hero2 to emit the
 *     work list AND the markdown rows that sit between the BELOW markers in
 *     README.md (an SVG inside an <img> cannot carry a link).
 * `fn` names the entry point; `flat` names the output file for the single-file
 * case. Getting these wrong silently ships a stale asset, so they are explicit.
 */
const ASSETS = [
  { name: 'hero',     module: './lib/hero2.mjs',        fn: 'render',     file: 'hero.svg',     height: 360, pair: true, title: 'Hero — INKWARD / 守墨 with generated field' },
  { name: 'work',     module: './lib/hero2.mjs',        fn: 'renderWork', file: 'work.svg',     height: 128, pair: true, title: 'Work list' },
  { name: 'matrix',   module: './lib/matrix.mjs',       height: 252, pair: true, title: 'Engineering matrix' },
  { name: 'activity', module: './lib/contribution.mjs', height: 188, pair: true, title: 'Activity strip and language mix' },
];

/**
 * Assets that ship as a real dark/light FILE PAIR instead of one self-theming
 * file.
 *
 * Why this exists — it was a live bug, not a preference. With `<picture>`, the
 * base `<img>` (the one with no matching `<source>`) is what a light-theme reader
 * gets, and its `src` pointed at the same file as the dark source. A
 * self-theming SVG resolves `prefers-color-scheme` against the IMAGE DOCUMENT,
 * which follows the operating system — not GitHub's `data-color-mode`. So a
 * reader on a light OS with GitHub in dark mode was served a light-theming
 * artwork: the hero rendered in the wrong theme on the live profile.
 *
 * Two files that each carry exactly one theme (no media query at all) are
 * deterministic in any embedding, and `<picture>` then does the switching it was
 * designed for. `pair: true` marks the assets that need this.
 */
/**
 * The shipped filename for an asset. `file` overrides it when the output name
 * differs from the registry name (hero/work), otherwise it is `<name>.svg`.
 */
const baseFile = (entry) => entry.file ?? `${entry.name}.svg`;

/** One member of a single-theme pair, e.g. hero-dark.svg. */
const PAIRED_FILE = (entry, theme) =>
  `${baseFile(entry).replace(/\.svg$/, '')}-${theme}.svg`;

/** Where the work list's markdown rows live inside README.md. */
const BELOW_BEGIN = '<!-- BELOW:BEGIN -->';
const BELOW_END = '<!-- BELOW:END -->';

const SCHEME_RE = /@media\s*\(\s*prefers-color-scheme\s*:\s*light\s*\)/g;

/**
 * Render one asset.
 *
 * Generators take (data, opts) where all opts are optional — an opts-free call
 * must produce the shipped asset, so a generator stays usable on its own.
 * `opts.scheme === 'light'` asks for the forced-light variant, which the
 * generator produces by using tokens.rootClass(scope, 'light').
 */
async function renderAsset(entry, data, opts = {}) {
  const mod = await import(new URL(entry.module, import.meta.url).href);
  const fnName = entry.fn ?? 'render';
  if (typeof mod[fnName] !== 'function') {
    throw new Error(`${entry.module} does not export ${fnName}(data, opts)`);
  }
  const out = await mod[fnName](data, opts);
  const svg = typeof out === 'string' ? out : out?.svg;
  if (typeof svg !== 'string' || !svg.includes('<svg')) {
    throw new Error(`${entry.module} ${fnName}() did not return SVG (got ${typeof svg})`);
  }
  return svg;
}

/** True when the generator went through tokens.styleBlock and honours a scheme. */
function hasSchemeSupport(svg) {
  SCHEME_RE.lastIndex = 0;
  const has = SCHEME_RE.test(svg);
  SCHEME_RE.lastIndex = 0;
  return has;
}

async function main() {
  if (!existsSync(DATA)) {
    console.error(`missing ${DATA} — run: node scripts/sync.mjs`);
    process.exit(1);
  }
  const data = JSON.parse(readFileSync(DATA, 'utf8'));

  /* copy.json used to hold hand-authored hero copy. hero2 derives everything it
     prints from data — the meta strip is real repo/star/licence counts and the
     tagline is the positioning line — so the file is retired. The merge stays
     for any future generator that wants a curated override. */
  if (existsSync(COPY)) {
    try {
      const copy = JSON.parse(readFileSync(COPY, 'utf8'));
      if (copy.hero) data.hero = { ...copy.hero, ...(data.hero ?? {}) };
      console.log(`merged copy from ${COPY}`);
    } catch (e) {
      console.error(`  WARNING: ${COPY} is not valid JSON (${e.message}) — ignoring it`);
    }
  }

  const outDir = OUT;
  const previewDir = join(OUT, 'preview');
  mkdirSync(outDir, { recursive: true });
  mkdirSync(previewDir, { recursive: true });

  const manifest = {
    generatedAt: new Date().toISOString(),
    dataGeneratedAt: data.generatedAt,
    assets: [],
  };

  const problems = [];

  /* Remove single-file outputs that a paired asset supersedes.
     Without this, switching an asset from the self-theming form to a real
     dark/light pair leaves the old file behind, and it is still referenced by
     nothing — dead weight in a repository that is meant to be read, and a trap
     for anyone who later edits the file that is no longer shipped. */
  for (const entry of ASSETS) {
    if (!entry.pair) continue;
    const stale = join(outDir, baseFile(entry));
    if (existsSync(stale)) {
      rmSync(stale);
      console.log(`  removed ${baseFile(entry)} (superseded by the -dark/-light pair)`);
    }
  }

  for (const entry of ASSETS) {
    try {
      const svg = await renderAsset(entry, data);
      const supportsScheme = hasSchemeSupport(svg);
      // `file` names the flat single-file output; otherwise the name is the stem.
      const outName = entry.file ?? `${entry.name}.svg`;
      const written = [];

      if (entry.pair) {
        /* A real file pair, one theme each and no media query, for <picture>.
           See PAIRED_FILE above for why the self-theming single file is wrong
           for these two. */
        for (const theme of ['dark', 'light']) {
          const themed = await renderAsset(entry, data, { theme });
          if (hasSchemeSupport(themed)) {
            problems.push(`${entry.name}-${theme}: still carries a media query — the pair must be single-theme`);
          }
          const name = PAIRED_FILE(entry, theme);
          writeFileSync(join(outDir, name), themed);
          writeFileSync(join(previewDir, name), themed);
          written.push(name);
          console.log(`  built ${name.padEnd(17)} ${String(Buffer.byteLength(themed, 'utf8')).padStart(7)} B  single-theme`);
        }
      } else if (supportsScheme) {
        // One shipped file. The asset themes itself, so there is nothing to
        // switch between and nothing that can drift out of sync.
        writeFileSync(join(outDir, outName), svg);
        written.push(outName);

        // Preview-only variants that pin the scheme, so both themes can be
        // screenshotted and reviewed on a single machine. The README never
        // references these. NOTE these are NOT what the paired assets above
        // emit: pinning via a class is defeated by an equal-specificity media
        // query, which is exactly the bug the pair exists to avoid.
        writeFileSync(join(previewDir, `${entry.name}-dark.svg`), await renderAsset(entry, data, {}));
        writeFileSync(join(previewDir, `${entry.name}-light.svg`), await renderAsset(entry, data, { scheme: 'light' }));
      } else {
        problems.push(`${entry.name}: no prefers-color-scheme block; the asset will not follow the reader's theme`);
        writeFileSync(join(outDir, outName), svg);
        written.push(outName);
      }

      manifest.assets.push({
        name: entry.name,
        title: entry.title,
        module: entry.module,
        height: entry.height,
        supportsColorScheme: supportsScheme,
        paired: !!entry.pair,
        bytes: Buffer.byteLength(svg, 'utf8'),
        files: written,
      });
      if (!entry.pair) {
        console.log(`  built ${outName.padEnd(17)} ${String(Buffer.byteLength(svg, 'utf8')).padStart(7)} B  scheme=${supportsScheme ? 'yes' : 'NO'}`);
      }
    } catch (e) {
      problems.push(`${entry.name}: ${e.message}`);
      console.error(`  FAILED ${entry.name}: ${e.message}`);
    }
  }

  /* The work list's markdown rows, rewritten from the same data so a new
     repository appears in the README with no code change. An SVG inside an
     <img> cannot carry a hyperlink, which is exactly why these rows exist. */
  try {
    const readme = join(KIT, 'README.md');
    if (existsSync(readme)) {
      const md = readFileSync(readme, 'utf8');
      const hero2 = await import(new URL('./lib/hero2.mjs', import.meta.url).href);
      if (typeof hero2.markdown === 'function'
        && md.includes(BELOW_BEGIN) && md.includes(BELOW_END)) {
        const rows = hero2.markdown(data).trim();
        const next = md.slice(0, md.indexOf(BELOW_BEGIN) + BELOW_BEGIN.length)
          + '\n' + rows + '\n'
          + md.slice(md.indexOf(BELOW_END));
        if (next !== md) {
          writeFileSync(readme, next);
          console.log('  updated    README.md work rows');
        } else {
          console.log('  unchanged  README.md work rows');
        }
      }
    }
  } catch (e) {
    problems.push(`README work rows: ${e.message}`);
  }

  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  if (problems.length) {
    console.error('\nbuild problems:');
    for (const p of problems) console.error('  - ' + p);
    process.exit(1);
  }
  console.log(`\nwrote ${manifest.assets.length} assets + preview variants to ${outDir}`);
}

main().catch((e) => { console.error('build failed:', e.stack ?? e.message); process.exit(1); });
