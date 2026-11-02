/**
 * Build-time GitHub star & contribution lookup. Runs once per repo/user per
 * `astro build`, well under rate limits. Never throws — a rate limit or
 * network failure degrades gracefully instead of failing the build.
 */
const cache = new Map<string, number | null>();

export async function getStars(repo: string): Promise<number | null> {
  if (cache.has(repo)) return cache.get(repo)!;

  try {
    const res = await fetch(`https://api.github.com/repos/${repo}`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'muhammadjon.me-build' },
    });
    if (!res.ok) {
      cache.set(repo, null);
      return null;
    }
    const data = (await res.json()) as { stargazers_count?: number };
    const stars = typeof data.stargazers_count === 'number' ? data.stargazers_count : null;
    cache.set(repo, stars);
    return stars;
  } catch {
    cache.set(repo, null);
    return null;
  }
}

export interface ContributionDay {
  date: string;
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
}

export interface GithubActivity {
  total: number;
  weeks: (ContributionDay | null)[][];
}

let activityCache: GithubActivity | null = null;

function groupIntoWeeks(days: ContributionDay[]): (ContributionDay | null)[][] {
  if (!days.length) return [];
  const weeks: (ContributionDay | null)[][] = [];
  let currentWeek: (ContributionDay | null)[] = [];

  const firstDayOfWeek = new Date(days[0].date + 'T00:00:00Z').getUTCDay();
  for (let i = 0; i < firstDayOfWeek; i++) {
    currentWeek.push(null);
  }

  for (const day of days) {
    currentWeek.push(day);
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) {
      currentWeek.push(null);
    }
    weeks.push(currentWeek);
  }
  return weeks;
}

export async function getGithubContributions(username = 'miuceo'): Promise<GithubActivity> {
  if (activityCache) return activityCache;

  try {
    const res = await fetch(`https://github-contributions-api.jogruber.de/v4/${username}?y=last`, {
      headers: { Accept: 'application/json', 'User-Agent': 'muhammadjon.me-build' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as {
      total?: { lastYear?: number };
      contributions?: ContributionDay[];
    };
    const days = Array.isArray(data.contributions) ? data.contributions : [];
    const total =
      typeof data.total?.lastYear === 'number'
        ? data.total.lastYear
        : days.reduce((sum, d) => sum + (d.count || 0), 0);

    activityCache = {
      total,
      weeks: groupIntoWeeks(days),
    };
    return activityCache;
  } catch {
    const fallbackDays: ContributionDay[] = [];
    const now = new Date();
    for (let i = 364; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      fallbackDays.push({
        date: d.toISOString().slice(0, 10),
        count: 0,
        level: 0,
      });
    }
    return {
      total: 0,
      weeks: groupIntoWeeks(fallbackDays),
    };
  }
}
