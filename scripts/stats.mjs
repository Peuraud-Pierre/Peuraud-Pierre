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

// Card colors per GitHub theme; lo/hi are the 3D blocks' quiet and busy days.
const THEMES = {
  dark: { bg: "#000000", border: "#2e2640", fg: "#ffffff", muted: "#a59fbd", accent: "#a78bfa", track: "#221c30",
    empty: "#1a1722", lo: [70, 60, 105], hi: [216, 204, 255] },
  light: { bg: "#ffffff", border: "#ddd3f3", fg: "#111111", muted: "#6b6480", accent: "#7c3aed", track: "#ece6f8",
    empty: "#ece9f3", lo: [214, 204, 242], hi: [109, 40, 217] },
};

const FONT = `font-family="'Segoe UI', Ubuntu, 'Helvetica Neue', sans-serif"`;
const W = 495, H = 195;
const frame = (body, th) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="4.5" fill="${th.bg}" stroke="${th.border}"/>
  ${body}
</svg>
`;
const fmt = (n) => n.toLocaleString("en-US");

export function renderStats(s, th) {
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
    return `<text x="25" y="${y}" fill="${th.fg}" font-size="13" ${FONT}>${icon}</text>
  <text x="45" y="${y}" fill="${th.fg}" font-size="13" ${FONT}>${label}:</text>
  <text x="300" y="${y}" fill="${th.fg}" font-size="13" font-weight="700" ${FONT}>${fmt(value)}</text>`;
  });
  return frame(`<text x="25" y="35" fill="${th.fg}" font-size="18" font-weight="600" ${FONT}>Pierre's GitHub Stats</text>
  ${lines.join("\n  ")}
  <circle cx="410" cy="110" r="40" fill="none" stroke="${th.track}" stroke-width="6"/>
  <circle cx="410" cy="110" r="40" fill="none" stroke="${th.accent}" stroke-width="6" stroke-linecap="round"
          stroke-dasharray="${(2 * Math.PI * 40 * Math.min(1, s.yearTotal / 1000)).toFixed(1)} 999" transform="rotate(-90 410 110)"/>
  <text x="410" y="108" fill="${th.fg}" font-size="20" font-weight="700" text-anchor="middle" ${FONT}>${fmt(s.yearTotal)}</text>
  <text x="410" y="126" fill="${th.muted}" font-size="10" text-anchor="middle" ${FONT}>in ${YEAR}</text>`, th);
}

export function renderStreak(s, th) {
  const col = (x, big, label, sub, bigY = 95) => `<text x="${x}" y="${bigY}" fill="${th.fg}" font-size="28" font-weight="700" text-anchor="middle" ${FONT}>${big}</text>
  <text x="${x}" y="130" fill="${th.fg}" font-size="14" text-anchor="middle" ${FONT}>${label}</text>
  <text x="${x}" y="150" fill="${th.muted}" font-size="11" text-anchor="middle" ${FONT}>${sub}</text>`;
  return frame(`${col(82.5, fmt(s.yearTotal), "Contributions", `${YEAR}`)}
  <line x1="165" y1="28" x2="165" y2="167" stroke="${th.border}"/>
  <line x1="330" y1="28" x2="330" y2="167" stroke="${th.border}"/>
  <circle cx="247.5" cy="75" r="33" fill="none" stroke="${th.accent}" stroke-width="5"/>
  ${col(247.5, s.current, "Current Streak", "days", 85)}
  ${col(412.5, s.longest, "Longest Streak", `days in ${YEAR}`)}`, th);
}

// Pixel stars blinking in the empty top-right corner of the 3D card.
let seed = 3;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const STARS = Array.from({ length: 14 }, () => ({
  x: 480 + rand() * 390, y: 50 + rand() * 200 * rand(), px: rand() < 0.3 ? 3 : 2,
  violet: rand() < 0.6, dur: 1.8 + rand() * 3, delay: rand() * 4,
}));
const twinkles = (th) => `<style>
    .tw { animation: tw ease-in-out infinite; opacity: 0.15; }
    @keyframes tw { 0%, 100% { opacity: 0.1; } 50% { opacity: 1; } }
  </style>
  ${STARS.map(({ x, y, px, violet, dur, delay }) =>
    `<path class="tw" style="animation-duration:${dur.toFixed(2)}s;animation-delay:-${delay.toFixed(2)}s" fill="${violet ? th.accent : th.fg}" d="M${(x - px / 2).toFixed(1)} ${(y - px * 1.5).toFixed(1)}h${px}v${px}h${px}v${px}h-${px}v${px}h-${px}v-${px}h-${px}v-${px}h${px}z"/>`).join("\n  ")}`;

// Isometric 3D calendar of the last 53 weeks: one block per day, its height
// following the contribution count.
export function renderIso(days, th) {
  const past = days.filter((d) => d.date <= TODAY);
  const start = past.length - (53 * 7 - (6 - new Date(TODAY).getUTCDay()));
  const cells = past.slice(Math.max(0, start));
  const GW = 900, GH = 470, S = 11.5, ox = 250, oy = 105, MAXH = 90;
  const max = Math.max(1, ...cells.map((c) => c.count));
  const u = [S * 0.866, S * 0.5], v = [-S * 0.866, S * 0.5]; // week axis, weekday axis
  const pt = (w, d, h = 0) => [ox + w * u[0] + d * v[0], oy + w * u[1] + d * v[1] - h];
  const poly = (pts, fill) => `<polygon points="${pts.map((p) => p.map((n) => n.toFixed(1)).join(",")).join(" ")}" fill="${fill}"/>`;
  const shade = (t, k) => `rgb(${th.lo.map((lo, i) => Math.round((lo + (th.hi[i] - lo) * t) * k)).join(",")})`;
  const first = new Date(cells[0].date).getUTCDay();
  const blocks = cells.map((c, i) => ({ ...c, w: Math.floor((i + first) / 7), d: (i + first) % 7 }))
    .sort((a, b) => a.w + a.d - (b.w + b.d) || a.d - b.d)
    .map(({ w, d, count }) => {
      const g = 0.12, a = w + g, b = d + g, e = 1 - 2 * g;
      if (!count) return poly([pt(a, b), pt(a + e, b), pt(a + e, b + e), pt(a, b + e)], th.empty);
      const t = Math.sqrt(count / max), h = 3 + t * MAXH;
      return [
        poly([pt(a, b + e), pt(a + e, b + e), pt(a + e, b + e, h), pt(a, b + e, h)], shade(t, 0.62)),
        poly([pt(a + e, b), pt(a + e, b + e), pt(a + e, b + e, h), pt(a + e, b, h)], shade(t, 0.8)),
        poly([pt(a, b, h), pt(a + e, b, h), pt(a + e, b + e, h), pt(a, b + e, h)], shade(t, 1)),
      ].join("");
    });
  const total = cells.reduce((s, c) => s + c.count, 0);
  const best = cells.reduce((m, c) => (c.count > m.count ? c : m), cells[0]);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${GW}" height="${GH}" viewBox="0 0 ${GW} ${GH}">
  <rect x="0.5" y="0.5" width="${GW - 1}" height="${GH - 1}" rx="4.5" fill="${th.bg}" stroke="${th.border}"/>
  <text x="${GW - 24}" y="30" fill="${th.muted}" font-size="11" text-anchor="end" ${FONT}>${cells[0].date} / ${cells.at(-1).date}</text>
  ${twinkles(th)}
  ${blocks.join("\n  ")}
  <text x="30" y="${GH - 58}" fill="${th.fg}" font-size="30" font-weight="700" ${FONT}>${fmt(total)}</text>
  <text x="30" y="${GH - 38}" fill="${th.muted}" font-size="12" ${FONT}>contributions in the last year</text>
  <text x="30" y="${GH - 20}" fill="${th.muted}" font-size="11" ${FONT}>best day: ${best.date} · ${best.count}</text>
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
for (const [name, th] of Object.entries(THEMES)) {
  writeFileSync(new URL(`stats-card-${name}.svg`, out), renderStats(stats, th));
  writeFileSync(new URL(`stats-streak-${name}.svg`, out), renderStreak(stats, th));
  writeFileSync(new URL(`stats-3d-${name}.svg`, out), renderIso(years.flat(), th));
}
