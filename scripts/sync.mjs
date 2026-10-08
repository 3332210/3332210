#!/usr/bin/env node
/**
 * Sync all live inputs into data/stats.json.
 *
 * This is the single entry point CI runs. It merges:
 *   - the profile/repo/language data from GitHub REST
 *   - the contribution calendar from GraphQL (when a token is present)
 *   - the real commit history of the featured repo
 * into the exact shape the asset generators consume.
 *
 * Usage:
 *   GITHUB_TOKEN=... node scripts/sync.mjs [--user 3332210] [--activity-days 30]
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

const USER = arg('user', process.env.PROFILE_USER ?? '3332210');
const OUT = resolve(arg('out', 'data/stats.json'));
const COPY = resolve(arg('copy', 'data/copy.json'));
const ACTIVITY_DAYS = parseInt(arg('activity-days', '30'), 10);
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';

const warnings = [];
const API = 'https://api.github.com';

function headers(extra = {}) {
  const h = {
    'User-Agent': 'profile-kit',
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...extra,
  };
  if (TOKEN) h.Authorization = `Bearer ${TOKEN}`;
  return h;
}

async function getJson(url) {
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText} :: ${body.slice(0, 180)}`);
  }
  return res.json();
}

const ymd = (d) => new Date(d).toISOString().slice(0, 10);
const dayKey = (iso) => iso.slice(0, 10);

/* --------------------------------------------------------------- REST side */

async function fetchUser() {
  const u = await getJson(`${API}/users/${USER}`);
  return {
    login: u.login,
    name: u.name ?? null,
    bio: u.bio ?? null,
    blog: u.blog || null,
    location: u.location ?? null,
    htmlUrl: u.html_url,
    avatarUrl: u.avatar_url,
    createdAt: u.created_at,
    publicRepos: u.public_repos ?? 0,
    followers: u.followers ?? 0,
  };
}

async function fetchRepos() {
  const repos = await getJson(`${API}/users/${USER}/repos?per_page=100&sort=pushed&type=owner`);
  return repos
    .filter((r) => !r.fork)
    .map((r) => ({
      name: r.name,
      description: r.description ?? '',
      htmlUrl: r.html_url,
      language: r.language ?? null,
      topics: r.topics ?? [],
      stars: r.stargazers_count ?? 0,
      forks: r.forks_count ?? 0,
      sizeKb: r.size ?? 0,
      license: r.license?.spdx_id ?? null,
      createdAt: r.created_at,
      pushedAt: r.pushed_at,
      archived: !!r.archived,
    }));
}

async function fetchLanguages(repos) {
  const totals = new Map();
  for (const r of repos) {
    try {
      const langs = await getJson(`${API}/repos/${USER}/${r.name}/languages`);
      for (const [name, bytes] of Object.entries(langs)) {
        totals.set(name, (totals.get(name) ?? 0) + bytes);
      }
    } catch (e) {
      warnings.push(`languages(${r.name}): ${e.message}`);
    }
  }
  const sum = [...totals.values()].reduce((a, b) => a + b, 0);
  return [...totals.entries()]
    .map(([name, bytes]) => ({ name, bytes, pct: sum ? +((bytes / sum) * 100).toFixed(1) : 0 }))
    .sort((a, b) => b.bytes - a.bytes);
}

/** Real commit history — the strongest honest signal this profile has. */
async function fetchCommits(repo) {
  try {
    const commits = await getJson(`${API}/repos/${USER}/${repo}/commits?per_page=100`);
    return commits.map((c) => ({
      sha: c.sha.slice(0, 7),
      date: dayKey(c.commit.author?.date ?? c.commit.committer?.date ?? ''),
      subject: (c.commit.message ?? '').split('\n')[0].trim(),
      type: /^(\w+)(\(|:)/.exec(c.commit.message ?? '')?.[1] ?? null,
    })).filter((c) => c.date);
  } catch (e) {
    warnings.push(`commits(${repo}): ${e.message}`);
    return [];
  }
}

/* ------------------------------------------------------------ GraphQL side */

const CONTRIB_QUERY = `
query($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    contributionsCollection(from: $from, to: $to) {
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount contributionLevel } }
      }
      totalCommitContributions
      totalRepositoriesWithContributedCommits
    }
  }
}`;

const LEVEL_MAP = {
  NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2,
  THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4,
};

async function fetchCalendar(days) {
  if (!TOKEN) {
    warnings.push('no token: contribution calendar unavailable');
    return null;
  }
  const to = new Date();
  to.setUTCHours(23, 59, 59, 0);
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - (days - 1));
  from.setUTCHours(0, 0, 0, 0);

  const res = await fetch(`${API}/graphql`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      query: CONTRIB_QUERY,
      variables: { login: USER, from: from.toISOString(), to: to.toISOString() },
    }),
  });
  if (!res.ok) {
    warnings.push(`graphql ${res.status}`);
    return null;
  }
  const j = await res.json();
  if (j.errors?.length) {
    warnings.push(`graphql: ${JSON.stringify(j.errors).slice(0, 200)}`);
    return null;
  }
  const cal = j.data?.user?.contributionsCollection?.contributionCalendar;
  if (!cal) {
    warnings.push('graphql: no contributionCalendar');
    return null;
  }
  const out = [];
  for (const w of cal.weeks) {
    for (const d of w.contributionDays) {
      out.push({ date: d.date, count: d.contributionCount, level: LEVEL_MAP[d.contributionLevel] ?? 0 });
    }
  }
  out.sort((a, b) => (a.date < b.date ? -1 : 1));
  return { total: cal.totalContributions, days: out };
}

/* ------------------------------------------------------------------ derive */

function lastNDays(all, n) {
  const byDate = new Map(all.map((d) => [d.date, d]));
  const out = [];
  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - i);
    const k = ymd(d);
    out.push(byDate.get(k) ?? { date: k, count: 0, level: 0 });
  }
  return out;
}

function streaks(days) {
  let longest = 0, run = 0, longestEnd = null;
  for (const d of days) {
    if (d.count > 0) { run++; if (run > longest) { longest = run; longestEnd = d.date; } }
    else run = 0;
  }
  let current = 0;
  for (let i = days.length - 1; i >= 0; i--) { if (days[i].count > 0) current++; else break; }
  return { current, longest, longestEnd };
}

/* -------------------------------------------------------------------- main */

async function main() {
  const user = await fetchUser();
  const repos = await fetchRepos();
  const languages = await fetchLanguages(repos);

  const calendar = await fetchCalendar(371);
  const allDays = calendar?.days ?? [];
  const activity = lastNDays(allDays, ACTIVITY_DAYS);
  const activeDays = activity.filter((d) => d.count > 0).length;
  const windowContributions = activity.reduce((a, d) => a + d.count, 0);

  // Featured project: most stars, tie-break on most recently pushed.
  const featured = [...repos].sort(
    (a, b) => b.stars - a.stars || (a.pushedAt < b.pushedAt ? 1 : -1),
  )[0] ?? null;

  let commits = [];
  let commitDays = [];
  if (featured) {
    commits = await fetchCommits(featured.name);
    const counts = new Map();
    for (const c of commits) counts.set(c.date, (counts.get(c.date) ?? 0) + 1);
    commitDays = [...counts.entries()].map(([date, count]) => ({ date, count }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    if (commits.length) {
      const days = [...counts.keys()].sort();
      const first = new Date(days[0] + 'T00:00:00Z');
      const last = new Date(days[days.length - 1] + 'T00:00:00Z');
      featured.buildSpanDays = Math.max(1, Math.round((last - first) / 86400000) + 1);
      featured.commitCount = commits.length;
    } else {
      featured.buildSpanDays = 1;
      featured.commitCount = 0;
    }
  }

  /* Hand-authored copy is optional, and currently retired: hero2 derives every
     string it prints from data — the meta strip is real repo/star/licence
     counts, the tagline is the positioning line. The hook stays so a curated
     override can be reintroduced by creating data/copy.json; its absence is
     normal and is not a warning. */
  let copy = null;
  if (existsSync(COPY)) {
    try {
      copy = JSON.parse(readFileSync(COPY, 'utf8'));
    } catch (e) {
      warnings.push(`copy.json is not valid JSON: ${e.message}`);
    }
  }

  const stats = {
    generatedAt: new Date().toISOString(),
    user,
    featured,
    repos,
    commits,
    commitDays,
    activity: {
      window: {
        days: ACTIVITY_DAYS,
        from: activity[0]?.date ?? null,
        to: activity[activity.length - 1]?.date ?? null,
      },
      series: activity,
      summary: {
        contributions: windowContributions,
        activeDays,
        longestStreak: streaks(activity).longest,
      },
      yearTotal: calendar?.total ?? 0,
      yearStreak: streaks(allDays).longest,
      calendar: allDays,
    },
    languages,
    totals: {
      publicRepos: user.publicRepos,
      nonForkRepos: repos.length,
      stars: repos.reduce((a, r) => a + r.stars, 0),
      forks: repos.reduce((a, r) => a + r.forks, 0),
      followers: user.followers,
      languageBytes: languages.reduce((a, l) => a + l.bytes, 0),
    },
    ...(copy ? { hero: copy.hero } : {}),
    meta: { user: USER, authenticated: !!TOKEN, warnings },
  };

  // Keep a stable generatedAt when nothing meaningful moved, so the scheduled
  // CI run does not commit noise on every tick.
  if (existsSync(OUT)) {
    try {
      const prev = JSON.parse(readFileSync(OUT, 'utf8'));
      const strip = (o) => { const c = structuredClone(o); delete c.generatedAt; return JSON.stringify(c); };
      if (strip(prev) === strip(stats)) stats.generatedAt = prev.generatedAt;
    } catch { /* ignore */ }
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(stats, null, 2) + '\n');

  console.log(`wrote ${OUT}`);
  console.log(`  user=${user.login} repos=${repos.length} stars=${stats.totals.stars}`);
  console.log(`  languages=${languages.map((l) => `${l.name} ${l.pct}%`).join(', ') || 'none'}`);
  console.log(`  featured=${featured?.name ?? 'none'} commits=${featured?.commitCount ?? 0} buildSpan=${featured?.buildSpanDays ?? 0}d`);
  console.log(`  activity: ${windowContributions} contributions on ${activeDays} active day(s) in last ${ACTIVITY_DAYS}`);
  for (const w of warnings) console.log(`  warning: ${w}`);
}

main().catch((e) => { console.error('sync failed:', e.message); process.exit(1); });
