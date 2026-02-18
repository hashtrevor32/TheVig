/**
 * ESPN Public API integration for fetching upcoming sports events.
 * No API key required — free public endpoints.
 */

export type SportEvent = {
  sport: string; // "nfl", "nba", "golf", etc. (matches our bet sport field)
  league: string; // "NFL", "NBA", "PGA Tour", etc.
  name: string; // "Kansas City Chiefs at Buffalo Bills"
  shortName: string; // "KC @ BUF"
  date: string; // ISO date string
  isTournament: boolean; // true for golf/tennis tournaments
};

type LeagueConfig = {
  sport: string; // our internal sport key
  espnSport: string; // ESPN URL segment for sport
  espnLeague: string; // ESPN URL segment for league
  leagueLabel: string; // display label
  isTournament: boolean; // true for golf, tennis, etc.
};

const LEAGUES: LeagueConfig[] = [
  { sport: "nfl", espnSport: "football", espnLeague: "nfl", leagueLabel: "NFL", isTournament: false },
  { sport: "nba", espnSport: "basketball", espnLeague: "nba", leagueLabel: "NBA", isTournament: false },
  { sport: "mlb", espnSport: "baseball", espnLeague: "mlb", leagueLabel: "MLB", isTournament: false },
  { sport: "nhl", espnSport: "hockey", espnLeague: "nhl", leagueLabel: "NHL", isTournament: false },
  { sport: "golf", espnSport: "golf", espnLeague: "pga", leagueLabel: "PGA Tour", isTournament: true },
  { sport: "ufc", espnSport: "mma", espnLeague: "ufc", leagueLabel: "UFC", isTournament: false },
  { sport: "college-football", espnSport: "football", espnLeague: "college-football", leagueLabel: "College Football", isTournament: false },
  { sport: "college-basketball", espnSport: "basketball", espnLeague: "mens-college-basketball", leagueLabel: "College Basketball", isTournament: false },
  { sport: "soccer", espnSport: "soccer", espnLeague: "eng.1", leagueLabel: "Premier League", isTournament: false },
];

// Simple in-memory cache: key → { events, timestamp }
const cache = new Map<string, { events: SportEvent[]; timestamp: number }>();
const CACHE_TTL = 2 * 60 * 60 * 1000; // 2 hours

function formatDateRange(start: Date, end: Date): string {
  const fmt = (d: Date) =>
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `${fmt(start)}-${fmt(end)}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseEspnEvents(data: any, config: LeagueConfig): SportEvent[] {
  if (!data?.events || !Array.isArray(data.events)) return [];

  return data.events
    .filter((event: { status?: { type?: { name?: string } } }) => {
      // Include scheduled, in-progress, and not-yet-started events
      const statusName = event.status?.type?.name || "";
      return statusName !== "STATUS_FINAL" && statusName !== "STATUS_CANCELED";
    })
    .map((event: { name?: string; shortName?: string; date?: string }) => ({
      sport: config.sport,
      league: config.leagueLabel,
      name: event.name || "Unknown Event",
      shortName: event.shortName || event.name || "Unknown",
      date: event.date || "",
      isTournament: config.isTournament,
    }));
}

async function fetchLeagueEvents(
  config: LeagueConfig,
  dateRange: string
): Promise<SportEvent[]> {
  const url = `https://site.api.espn.com/apis/site/v2/sports/${config.espnSport}/${config.espnLeague}/scoreboard?dates=${dateRange}`;

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: 7200 }, // 2hr cache at fetch level
  });

  if (!res.ok) {
    // Off-season or invalid league returns 404 — not an error
    return [];
  }

  const data = await res.json();
  return parseEspnEvents(data, config);
}

/**
 * Fetch upcoming sports events across all major leagues for the given date range.
 * Uses ESPN's free public API. Results are cached for 2 hours.
 */
export async function fetchUpcomingEvents(
  start: Date,
  end: Date
): Promise<SportEvent[]> {
  const dateRange = formatDateRange(start, end);

  // Check cache
  const cached = cache.get(dateRange);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.events;
  }

  // Fetch all leagues in parallel
  const results = await Promise.allSettled(
    LEAGUES.map((config) => fetchLeagueEvents(config, dateRange))
  );

  const events: SportEvent[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      events.push(...result.value);
    }
    // Rejected = league failed, skip silently
  }

  // Sort by date
  events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Deduplicate tournaments (golf tournaments appear once, not per-round)
  const seen = new Set<string>();
  const deduped = events.filter((e) => {
    if (e.isTournament) {
      const key = `${e.sport}-${e.name}`;
      if (seen.has(key)) return false;
      seen.add(key);
    }
    return true;
  });

  // Cache
  cache.set(dateRange, { events: deduped, timestamp: Date.now() });

  return deduped;
}

/**
 * Group events by sport for display.
 */
export function groupEventsBySport(
  events: SportEvent[]
): Record<string, SportEvent[]> {
  const groups: Record<string, SportEvent[]> = {};
  for (const event of events) {
    const key = event.league;
    if (!groups[key]) groups[key] = [];
    groups[key].push(event);
  }
  return groups;
}

/**
 * Format events into a readable summary for the Claude prompt.
 */
export function formatEventsForPrompt(events: SportEvent[]): string {
  const groups = groupEventsBySport(events);
  const lines: string[] = [];

  for (const [league, leagueEvents] of Object.entries(groups)) {
    if (leagueEvents.length === 0) continue;

    const firstEvent = leagueEvents[0];
    if (firstEvent.isTournament) {
      // For tournaments, just list the tournament name
      lines.push(`${league}: ${leagueEvents.map((e) => e.name).join(", ")}`);
    } else {
      // For team sports, list game count and some matchups
      const gameCount = leagueEvents.length;
      const sampleGames = leagueEvents
        .slice(0, 5)
        .map((e) => e.shortName)
        .join(", ");
      lines.push(
        `${league}: ${gameCount} game${gameCount > 1 ? "s" : ""} (${sampleGames}${gameCount > 5 ? ", ..." : ""})`
      );
    }
  }

  return lines.length > 0
    ? lines.join("\n")
    : "No upcoming events found for this date range.";
}
