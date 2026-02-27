/**
 * The-Odds-API v4 integration for real-time sportsbook odds.
 * Free tier: 500 credits/month.
 * Docs: https://the-odds-api.com/liveapi/guides/v4/
 */

// ── Raw API response types ──────────────────────────────────────────

export type OddsApiOutcome = {
  name: string; // Team name, "Over", "Under"
  price: number; // American odds (-110, +150)
  point?: number; // Spread/total line (-3.5, 215.5)
  link?: string; // Deep link to bet slip
  sid?: string; // Source ID for custom link construction
};

export type OddsApiMarket = {
  key: string; // "h2h" | "spreads" | "totals"
  last_update: string;
  outcomes: OddsApiOutcome[];
  link?: string;
};

export type OddsApiBookmaker = {
  key: string; // "draftkings", "fanduel", "pinnacle", etc.
  title: string;
  last_update: string;
  markets: OddsApiMarket[];
  link?: string; // Event-level link
};

export type OddsApiEvent = {
  id: string;
  sport_key: string; // "americanfootball_nfl"
  sport_title: string; // "NFL"
  commence_time: string; // ISO 8601
  home_team: string;
  away_team: string;
  bookmakers: OddsApiBookmaker[];
};

// ── Sport mapping ───────────────────────────────────────────────────

export type SportConfig = {
  oddsApiKey: string;
  internalKey: string;
  displayName: string;
  active: boolean;
};

export const SPORT_MAP: SportConfig[] = [
  { oddsApiKey: "americanfootball_nfl", internalKey: "nfl", displayName: "NFL", active: true },
  { oddsApiKey: "basketball_nba", internalKey: "nba", displayName: "NBA", active: true },
  { oddsApiKey: "icehockey_nhl", internalKey: "nhl", displayName: "NHL", active: true },
  { oddsApiKey: "baseball_mlb", internalKey: "mlb", displayName: "MLB", active: true },
  { oddsApiKey: "americanfootball_ncaaf", internalKey: "college-football", displayName: "NCAAF", active: true },
  { oddsApiKey: "basketball_ncaab", internalKey: "college-basketball", displayName: "NCAAB", active: true },
  { oddsApiKey: "mma_mixed_martial_arts", internalKey: "ufc", displayName: "MMA", active: true },
  { oddsApiKey: "soccer_epl", internalKey: "soccer", displayName: "EPL", active: true },
  { oddsApiKey: "soccer_usa_mls", internalKey: "mls", displayName: "MLS", active: true },
];

// ── User's sportsbooks ─────────────────────────────────────────────

export const USER_BOOKS = [
  "draftkings",
  "fanduel",
  "bet365",
  "betmgm",
  "williamhill_us", // Caesars
  "fanatics",
] as const;

export const BOOK_DISPLAY_NAMES: Record<string, string> = {
  draftkings: "DraftKings",
  fanduel: "FanDuel",
  bet365: "Bet365",
  betmgm: "BetMGM",
  williamhill_us: "Caesars",
  fanatics: "Fanatics",
  pinnacle: "Pinnacle",
  betonlineag: "BetOnline",
  bovada: "Bovada",
  unibet_us: "Unibet",
  pointsbetus: "PointsBet",
  superbook: "SuperBook",
  wynnbet: "WynnBET",
  lowvig: "LowVig",
  mybookieag: "MyBookie",
  betus: "BetUS",
  betrivers: "BetRivers",
  twinspires: "TwinSpires",
  fliff: "Fliff",
  hardrockbet: "Hard Rock",
  espnbet: "ESPN BET",
};

export const SHARP_BOOK = "pinnacle";

// User's state for sportsbook deep links (BetMGM uses {state} placeholder)
export const USER_STATE = "nc";


export function isUserBook(bookKey: string): boolean {
  return (USER_BOOKS as readonly string[]).includes(bookKey);
}

export function getBookDisplayName(bookKey: string): string {
  return BOOK_DISPLAY_NAMES[bookKey] || bookKey;
}

// ── Caching ─────────────────────────────────────────────────────────

const oddsCache = new Map<
  string,
  { data: OddsApiEvent[]; timestamp: number; creditsUsed: number }
>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

let totalCreditsUsed = 0;
let lastCreditsRemaining: number | null = null;

export function getCacheInfo(key: string) {
  const cached = oddsCache.get(key);
  if (!cached) return { valid: false, ageMs: null };
  const age = Date.now() - cached.timestamp;
  return { valid: age < CACHE_TTL, ageMs: age };
}

export function getCreditStats() {
  return { used: totalCreditsUsed, remaining: lastCreditsRemaining };
}

/** Replace {state} placeholders in sportsbook deep links */
function fixLinks(events: OddsApiEvent[]): OddsApiEvent[] {
  for (const event of events) {
    for (const book of event.bookmakers) {
      if (book.link) book.link = book.link.replace("{state}", USER_STATE);
      for (const market of book.markets) {
        if (market.link) market.link = market.link.replace("{state}", USER_STATE);
        for (const outcome of market.outcomes) {
          if (outcome.link) outcome.link = outcome.link.replace("{state}", USER_STATE);
        }
      }
    }
  }
  return events;
}

// ── API fetching ────────────────────────────────────────────────────

export async function fetchOddsForSport(
  sportKey: string,
  markets: string[] = ["h2h"]
): Promise<OddsApiEvent[]> {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    throw new Error("ODDS_API_KEY not configured");
  }

  const cacheKey = `${sportKey}:${markets.join(",")}`;
  const cached = oddsCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const params = new URLSearchParams({
    apiKey,
    regions: "us,eu",
    markets: markets.join(","),
    oddsFormat: "american",
    includeLinks: "true",
    includeSids: "true",
  });

  const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/odds/?${params}`;
  const res = await fetch(url);

  // Track credits from response headers
  const remaining = res.headers.get("x-requests-remaining");
  const used = res.headers.get("x-requests-last");
  if (remaining) lastCreditsRemaining = parseInt(remaining, 10);
  if (used) totalCreditsUsed += parseInt(used, 10);

  if (!res.ok) {
    if (res.status === 404) return []; // Sport not in season
    if (res.status === 401) throw new Error("Invalid ODDS_API_KEY");
    if (res.status === 429) throw new Error("API rate limit exceeded");
    throw new Error(`Odds API error: ${res.status}`);
  }

  const data: OddsApiEvent[] = await res.json();

  // Filter to only upcoming events (not already started)
  const now = new Date();
  const upcoming = fixLinks(
    data.filter((e) => new Date(e.commence_time) > now)
  );

  // Cache
  oddsCache.set(cacheKey, {
    data: upcoming,
    timestamp: Date.now(),
    creditsUsed: used ? parseInt(used, 10) : 0,
  });

  return upcoming;
}

export async function fetchOddsForAllActiveSports(
  markets?: string[]
): Promise<OddsApiEvent[]> {
  const activeSports = SPORT_MAP.filter((s) => s.active);

  const results = await Promise.allSettled(
    activeSports.map((s) => fetchOddsForSport(s.oddsApiKey, markets))
  );

  const events: OddsApiEvent[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      events.push(...result.value);
    }
  }

  // Sort by commence_time
  events.sort(
    (a, b) =>
      new Date(a.commence_time).getTime() -
      new Date(b.commence_time).getTime()
  );

  return events;
}

/** Map internal sport key to Odds API key */
export function toOddsApiKey(internalKey: string): string | null {
  const config = SPORT_MAP.find((s) => s.internalKey === internalKey);
  return config?.oddsApiKey ?? null;
}

/** Map Odds API sport key to display name */
export function sportDisplayName(oddsApiKey: string): string {
  const config = SPORT_MAP.find((s) => s.oddsApiKey === oddsApiKey);
  return config?.displayName ?? oddsApiKey;
}
