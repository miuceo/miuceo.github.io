/**
 * Build-time GitHub star lookup. Runs once per repo per `astro build`, well
 * under the unauthenticated API's 60 req/hour limit for this site's repo
 * count. Never throws — a rate limit or network failure just omits the
 * star count for that card instead of failing the build.
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
