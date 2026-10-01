// Generates combined GitHub + GitLab stats cards (assets/combined-*.svg).
//
// Env:
//   GH_USER       GitHub login (default: Peuraud-Pierre)
//   GH_TOKEN      token for the GitHub GraphQL API
//   GITLAB_URL    e.g. https://git.vintagestandards.fr
//   GITLAB_TOKEN  personal access token with the read_api scope
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const GH_USER = process.env.GH_USER || "Peuraud-Pierre";
const DAYS = 365;
const GRAPH_DAYS = 31;

const iso = (d) => d.toISOString().slice(0, 10);

function emptyDays() {
  const days = new Map();
  const today = new Date();
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    days.set(iso(d), { gh: 0, gl: 0 });
  }
  return days;
}

async function fetchGitHub(days) {
  const token = process.env.GH_TOKEN;
  if (!token) {
    console.warn("GH_TOKEN missing, skipping GitHub");
    return { commits: 0, repos: 0, stars: 0 };
  }
  const query = `query($login: String!) {
    user(login: $login) {
      repositories(ownerAffiliations: OWNER, first: 100) {
        totalCount
        nodes { stargazerCount }
      }
      contributionsCollection {
        totalCommitContributions
        restrictedContributionsCount
        contributionCalendar { weeks { contributionDays { date contributionCount } } }
      }
    }
  }`;
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { login: GH_USER } }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(`GitHub: ${JSON.stringify(json.errors)}`);
  const u = json.data.user;
  const c = u.contributionsCollection;
  for (const w of c.contributionCalendar.weeks)
    for (const d of w.contributionDays)
      if (days.has(d.date)) days.get(d.date).gh += d.contributionCount;
  return {
    commits: c.totalCommitContributions + c.restrictedContributionsCount,
    repos: u.repositories.totalCount,
    stars: u.repositories.nodes.reduce((s, r) => s + r.stargazerCount, 0),
  };
}

async function gitlab(path) {
  const res = await fetch(`${process.env.GITLAB_URL}/api/v4${path}`, {
    headers: { "PRIVATE-TOKEN": process.env.GITLAB_TOKEN },
  });
  if (!res.ok) throw new Error(`GitLab ${path}: ${res.status} ${await res.text()}`);
  return { body: await res.json(), headers: res.headers };
}

async function fetchGitLab(days) {
  if (!process.env.GITLAB_URL || !process.env.GITLAB_TOKEN) {
    console.warn("GITLAB_URL/GITLAB_TOKEN missing, skipping GitLab");
    return { commits: 0, repos: 0, stars: 0 };
  }
  const first = [...days.keys()][0];
  const after = new Date(first);
  after.setUTCDate(after.getUTCDate() - 1);

  // Like GitLab's own calendar: every event counts as one contribution.
  let commits = 0;
  for (let page = 1; ; page++) {
    const { body } = await gitlab(`/events?after=${iso(after)}&per_page=100&page=${page}`);
    for (const e of body) {
      const day = days.get(e.created_at.slice(0, 10));
      if (day) day.gl += 1;
      if (e.push_data) commits += e.push_data.commit_count || 0;
    }
    if (body.length < 100) break;
  }

  const { body: projects, headers } = await gitlab(`/projects?membership=true&simple=true&per_page=100`);
  const repos = Number(headers.get("x-total")) || projects.length;
  const stars = projects.reduce((s, p) => s + (p.star_count || 0), 0);
  return { commits, repos, stars };
}

function streaks(days) {
  const counts = [...days.values()].map((d) => d.gh + d.gl);
  let longest = 0, run = 0;
  for (const c of counts) {
    run = c > 0 ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  // Today not having contributions yet doesn't break the current streak.
  let current = 0;
  let i = counts.length - 1;
  if (counts[i] === 0) i--;
  while (i >= 0 && counts[i] > 0) { current++; i--; }
  return { current, longest };
}

const FONT = `font-family="'Segoe UI', Ubuntu, 'Helvetica Neue', sans-serif"`;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

export function renderStats(s) {
  const rows = [
    ["Total contributions (last year)", s.total],
    ["  GitHub", s.ghTotal],
    ["  GitLab (vintagestandards)", s.glTotal],
    ["Total commits (last year)", s.commits],
    ["Repositories", s.repos],
    ["Stars earned", s.stars],
    ["Current streak", `${s.current} day${s.current === 1 ? "" : "s"}`],
    ["Longest streak", `${s.longest} day${s.longest === 1 ? "" : "s"}`],
  ];
  const lines = rows.map(([label, value], i) => {
    const y = 72 + i * 25;
    const sub = label.startsWith("  ");
    return `<text x="${sub ? 46 : 30}" y="${y}" fill="${sub ? "#aaaaaa" : "#ffffff"}" font-size="14" ${FONT}>${esc(label.trim())}</text>
    <text x="420" y="${y}" fill="#ffffff" font-size="14" font-weight="600" text-anchor="end" ${FONT}>${esc(value)}</text>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="450" height="${72 + rows.length * 25}" viewBox="0 0 450 ${72 + rows.length * 25}">
  <rect x="0.5" y="0.5" width="449" height="${71 + rows.length * 25}" rx="4" fill="#000000" stroke="#444444"/>
  <text x="30" y="38" fill="#ffffff" font-size="18" font-weight="600" ${FONT}>Pierre's Combined Stats</text>
  <text x="420" y="38" fill="#888888" font-size="11" text-anchor="end" ${FONT}>GitHub + GitLab</text>
  ${lines.join("\n  ")}
</svg>
`;
}

export function renderGraph(days) {
  const pts = [...days.entries()].slice(-GRAPH_DAYS).map(([date, d]) => ({ date, n: d.gh + d.gl }));
  const W = 900, H = 300, L = 60, R = 30, T = 50, B = 50;
  const max = Math.max(4, ...pts.map((p) => p.n));
  const step = (W - L - R) / (pts.length - 1);
  const x = (i) => L + i * step;
  const y = (n) => T + (H - T - B) * (1 - n / max);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.n).toFixed(1)}`).join(" ");
  const area = `${line} L${x(pts.length - 1)} ${H - B} L${L} ${H - B} Z`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));
  const grid = [...new Set(ticks)].map((n) =>
    `<line x1="${L}" x2="${W - R}" y1="${y(n)}" y2="${y(n)}" stroke="#222"/>
  <text x="${L - 10}" y="${y(n) + 4}" fill="#aaa" font-size="11" text-anchor="end" ${FONT}>${n}</text>`).join("\n  ");
  const labels = pts.map((p, i) =>
    `<text x="${x(i)}" y="${H - B + 18}" fill="#aaa" font-size="10" text-anchor="middle" ${FONT}>${Number(p.date.slice(8))}</text>`).join("");
  const dots = pts.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.n)}" r="3" fill="#fff"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="4" fill="#000" stroke="#444"/>
  <text x="${W / 2}" y="30" fill="#fff" font-size="16" font-weight="600" text-anchor="middle" ${FONT}>Pierre's Contribution Graph (GitHub + GitLab)</text>
  ${grid}
  <path d="${area}" fill="#ffffff" fill-opacity="0.08"/>
  <path d="${line}" fill="none" stroke="#fff" stroke-width="2"/>
  ${dots}
  ${labels}
  <text x="${W / 2}" y="${H - 10}" fill="#aaa" font-size="11" text-anchor="middle" ${FONT}>Days</text>
  <text x="18" y="${H / 2}" fill="#aaa" font-size="11" text-anchor="middle" transform="rotate(-90 18 ${H / 2})" ${FONT}>Contributions</text>
</svg>
`;
}

async function main() {
  const days = emptyDays();
  const [gh, gl] = await Promise.all([fetchGitHub(days), fetchGitLab(days)]);
  const all = [...days.values()];
  const stats = {
    ghTotal: all.reduce((s, d) => s + d.gh, 0),
    glTotal: all.reduce((s, d) => s + d.gl, 0),
    commits: gh.commits + gl.commits,
    repos: gh.repos + gl.repos,
    stars: gh.stars + gl.stars,
    ...streaks(days),
  };
  stats.total = stats.ghTotal + stats.glTotal;
  console.log(stats);
  const out = new URL("../assets/", import.meta.url);
  writeFileSync(new URL("combined-stats.svg", out), renderStats(stats));
  writeFileSync(new URL("combined-graph.svg", out), renderGraph(days));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
