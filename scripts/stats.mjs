// Generates the profile stats cards (assets/stats-*.svg) from the GitHub
// contribution calendar, which includes private contributions when
// "Include private contributions on my profile" is enabled.
//
// Env: GH_USER (default Peuraud-Pierre), GH_TOKEN (GraphQL; without it the
// public profile pages are scraped instead, handy for local runs).
import { writeFileSync } from "node:fs";

const USER = process.env.GH_USER || "Peuraud-Pierre";
const TOKEN = process.env.GH_TOKEN;
const YEAR = new Date().getUTCFullYear();
const TODAY = new Date().toISOString().slice(0, 10);

async function graphql(query, variables) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

async function profile() {
  if (TOKEN) {
    const { user } = await graphql(`query($login: String!) {
      user(login: $login) {
        createdAt
        pullRequests { totalCount }
        issues { totalCount }
        repositories(ownerAffiliations: OWNER, first: 100) { totalCount nodes { stargazerCount } }
      }
    }`, { login: USER });
    return {
      createdAt: user.createdAt,
      prs: user.pullRequests.totalCount,
      issues: user.issues.totalCount,
      repos: user.repositories.totalCount,
      stars: user.repositories.nodes.reduce((s, r) => s + r.stargazerCount, 0),
    };
  }
  const user = await (await fetch(`https://api.github.com/users/${USER}`)).json();
  const repos = await (await fetch(`https://api.github.com/users/${USER}/repos?per_page=100`)).json();
  return {
    createdAt: user.created_at,
    prs: 0,
    issues: 0,
    repos: user.public_repos,
    stars: repos.reduce((s, r) => s + r.stargazers_count, 0),
  };
}

// Returns [{ date, count }] for one calendar year.
async function calendar(year) {
  const from = `${year}-01-01T00:00:00Z`, to = `${year}-12-31T23:59:59Z`;
  if (TOKEN) {
    const { user } = await graphql(`query($login: String!, $from: DateTime!, $to: DateTime!) {
      user(login: $login) {
        contributionsCollection(from: $from, to: $to) {
          contributionCalendar { weeks { contributionDays { date contributionCount } } }
        }
      }
    }`, { login: USER, from, to });
    return user.contributionsCollection.contributionCalendar.weeks
      .flatMap((w) => w.contributionDays)
      .map((d) => ({ date: d.date, count: d.contributionCount }));
  }
  const html = await (await fetch(
    `https://github.com/users/${USER}/contributions?from=${year}-01-01&to=${year}-12-31`)).text();
  const dates = new Map();
  for (const m of html.matchAll(/data-date="([\d-]+)" id="([^"]+)"/g)) dates.set(m[2], m[1]);
  const days = [];
  for (const m of html.matchAll(/for="([^"]+)"[^>]*>(No|\d+) contributions?/g))
    if (dates.has(m[1])) days.push({ date: dates.get(m[1]), count: m[2] === "No" ? 0 : Number(m[2]) });
  return days.sort((a, b) => a.date.localeCompare(b.date));
}

function streaks(days) {
  const counts = days.filter((d) => d.date <= TODAY).map((d) => d.count);
  let longest = 0, run = 0;
  for (const c of counts) {
    run = c > 0 ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  // No contribution yet today doesn't break the current streak.
  let current = 0, i = counts.length - 1;
  if (counts[i] === 0) i--;
  while (i >= 0 && counts[i] > 0) { current++; i--; }
  return { current, longest };
}

const FONT = `font-family="'Segoe UI', Ubuntu, 'Helvetica Neue', sans-serif"`;
const W = 495, H = 195;
const frame = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="4.5" fill="#000" stroke="#444"/>
  ${body}
</svg>
`;
const fmt = (n) => n.toLocaleString("en-US");

export function renderStats(s) {
  const rows = [
    ["★", `Total contributions (${YEAR})`, s.yearTotal],
    ["◷", "Total contributions (all time)", s.allTotal],
    ["⎇", "Total PRs", s.prs],
    ["!", "Total issues", s.issues],
    ["▤", "Repositories", s.repos],
    ["☆", "Stars earned", s.stars],
  ];
  const lines = rows.map(([icon, label, value], i) => {
    const y = 70 + i * 22;
    return `<text x="25" y="${y}" fill="#fff" font-size="13" ${FONT}>${icon}</text>
  <text x="45" y="${y}" fill="#fff" font-size="13" ${FONT}>${label}:</text>
  <text x="300" y="${y}" fill="#fff" font-size="13" font-weight="700" ${FONT}>${fmt(value)}</text>`;
  });
  return frame(`<text x="25" y="35" fill="#fff" font-size="18" font-weight="600" ${FONT}>Pierre's GitHub Stats</text>
  ${lines.join("\n  ")}
  <circle cx="410" cy="110" r="40" fill="none" stroke="#333" stroke-width="6"/>
  <circle cx="410" cy="110" r="40" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round"
          stroke-dasharray="${(2 * Math.PI * 40 * Math.min(1, s.yearTotal / 1000)).toFixed(1)} 999" transform="rotate(-90 410 110)"/>
  <text x="410" y="108" fill="#fff" font-size="20" font-weight="700" text-anchor="middle" ${FONT}>${fmt(s.yearTotal)}</text>
  <text x="410" y="126" fill="#aaa" font-size="10" text-anchor="middle" ${FONT}>in ${YEAR}</text>`);
}

export function renderStreak(s) {
  const col = (x, big, label, sub, bigY = 95) => `<text x="${x}" y="${bigY}" fill="#fff" font-size="28" font-weight="700" text-anchor="middle" ${FONT}>${big}</text>
  <text x="${x}" y="130" fill="#fff" font-size="14" text-anchor="middle" ${FONT}>${label}</text>
  <text x="${x}" y="150" fill="#aaa" font-size="11" text-anchor="middle" ${FONT}>${sub}</text>`;
  return frame(`${col(82.5, fmt(s.yearTotal), "Contributions", `${YEAR}`)}
  <line x1="165" y1="28" x2="165" y2="167" stroke="#fff"/>
  <line x1="330" y1="28" x2="330" y2="167" stroke="#fff"/>
  <circle cx="247.5" cy="75" r="33" fill="none" stroke="#fff" stroke-width="5"/>
  ${col(247.5, s.current, "Current Streak", "days", 85)}
  ${col(412.5, s.longest, "Longest Streak", `days in ${YEAR}`)}`);
}

export function renderGraph(days) {
  const pts = days.filter((d) => d.date <= TODAY);
  const GW = 900, GH = 300, L = 55, R = 25, T = 50, B = 50;
  const max = Math.max(4, ...pts.map((p) => p.count));
  const step = (GW - L - R) / Math.max(1, pts.length - 1);
  const x = (i) => L + i * step;
  const y = (n) => T + (GH - T - B) * (1 - n / max);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.count).toFixed(1)}`).join(" ");
  const area = `${line} L${x(pts.length - 1).toFixed(1)} ${GH - B} L${L} ${GH - B} Z`;
  const grid = [...new Set([0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f)))].map((n) =>
    `<line x1="${L}" x2="${GW - R}" y1="${y(n)}" y2="${y(n)}" stroke="#222"/>
  <text x="${L - 10}" y="${y(n) + 4}" fill="#aaa" font-size="11" text-anchor="end" ${FONT}>${n}</text>`).join("\n  ");
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const months = pts.map((p, i) => p.date.endsWith("-01")
    ? `<text x="${x(i)}" y="${GH - B + 20}" fill="#aaa" font-size="11" text-anchor="middle" ${FONT}>${MONTHS[Number(p.date.slice(5, 7)) - 1]}</text>`
    : "").join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${GW}" height="${GH}" viewBox="0 0 ${GW} ${GH}">
  <rect x="0.5" y="0.5" width="${GW - 1}" height="${GH - 1}" rx="4.5" fill="#000" stroke="#444"/>
  <text x="${GW / 2}" y="30" fill="#fff" font-size="16" font-weight="600" text-anchor="middle" ${FONT}>Pierre's Contribution Graph (${YEAR})</text>
  ${grid}
  <path d="${area}" fill="#fff" fill-opacity="0.08"/>
  <path d="${line}" fill="none" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>
  ${months}
  <text x="16" y="${GH / 2}" fill="#aaa" font-size="11" text-anchor="middle" transform="rotate(-90 16 ${GH / 2})" ${FONT}>Contributions</text>
</svg>
`;
}

const p = await profile();
const years = [];
for (let y = new Date(p.createdAt).getUTCFullYear(); y <= YEAR; y++) years.push(await calendar(y));
const thisYear = years.at(-1);
const sum = (days) => days.reduce((s, d) => s + d.count, 0);
const stats = { ...p, yearTotal: sum(thisYear), allTotal: years.reduce((s, d) => s + sum(d), 0), ...streaks(thisYear) };
console.log(stats);

const out = new URL("../assets/", import.meta.url);
writeFileSync(new URL("stats-card.svg", out), renderStats(stats));
writeFileSync(new URL("stats-streak.svg", out), renderStreak(stats));
writeFileSync(new URL("stats-graph.svg", out), renderGraph(thisYear));
