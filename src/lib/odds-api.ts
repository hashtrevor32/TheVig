/**
 * The-Odds-API v4 integration for real-time sportsbook odds.
 * Free tier: 500 credits/month.
 * Docs: https://the-odds-api.com/liveapi/guides/v4/
 */

// ── Raw API response types ──────────────────────────────────────────

export type OddsApiOutcome = {
  name: string; // Team name, "Over", "Under", or player name (goalscorer markets)
  description?: string; // Player name for player prop markets
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
  "espnbet",
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
  espnbet: "theScore Bet",
};

export const SHARP_BOOK = "pinnacle";

// Books used for Sharp Picks suggestions (subset of USER_BOOKS)
export const SHARP_PICKS_BOOKS = ["bet365", "fanduel", "draftkings"] as const;

// Markets to fetch per sport for Sharp Picks (event-specific endpoint)
export const SPORT_MARKETS: Record<string, string[]> = {
  basketball_nba: [
    "h2h", "spreads", "totals",
    "player_points", "player_rebounds", "player_assists",
    "player_threes", "player_points_rebounds_assists",
    "player_blocks", "player_steals",
  ],
  basketball_ncaab: [
    "h2h", "spreads", "totals",
    "player_points", "player_rebounds", "player_assists",
    "player_threes", "player_points_rebounds_assists",
  ],
  soccer_epl: [
    "h2h", "spreads", "totals",
    "btts", "draw_no_bet", "double_chance",
    "team_totals", "totals_h1",
    "player_goal_scorer_anytime", "player_first_goal_scorer",
    "player_shots", "player_shots_on_target",
    "player_assists", "player_to_receive_card",
  ],
  soccer_usa_mls: [
    "h2h", "spreads", "totals",
    "btts", "draw_no_bet", "double_chance",
    "team_totals", "totals_h1",
    "player_goal_scorer_anytime", "player_first_goal_scorer",
    "player_shots", "player_shots_on_target",
    "player_assists", "player_to_receive_card",
  ],
};

export const SHARP_PICKS_SPORTS = new Set(Object.keys(SPORT_MARKETS));

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
const CACHE_TTL = 60 * 1000; // 1 minute

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
  const statePattern = /\{state\}/g;
  for (const event of events) {
    for (const book of event.bookmakers) {
      if (book.link) book.link = book.link.replace(statePattern, USER_STATE);
      for (const market of book.markets) {
        if (market.link) market.link = market.link.replace(statePattern, USER_STATE);
        for (const outcome of market.outcomes) {
          if (outcome.link) outcome.link = outcome.link.replace(statePattern, USER_STATE);
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

// ── Event-specific odds (supports ALL markets including props) ────

const eventOddsCache = new Map<
  string,
  { data: OddsApiEvent; timestamp: number }
>();
const EVENT_CACHE_TTL = 2 * 60 * 1000; // 2 minutes

export async function fetchEventOdds(
  sportKey: string,
  eventId: string,
  markets: string[]
): Promise<OddsApiEvent | null> {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) throw new Error("ODDS_API_KEY not configured");

  const cacheKey = `event:${eventId}:${markets.join(",")}`;
  const cached = eventOddsCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < EVENT_CACHE_TTL) {
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

  const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/events/${eventId}/odds/?${params}`;
  const res = await fetch(url);

  const remaining = res.headers.get("x-requests-remaining");
  const used = res.headers.get("x-requests-last");
  if (remaining) lastCreditsRemaining = parseInt(remaining, 10);
  if (used) totalCreditsUsed += parseInt(used, 10);

  if (!res.ok) {
    if (res.status === 404) return null;
    if (res.status === 401) throw new Error("Invalid ODDS_API_KEY");
    if (res.status === 429) throw new Error("API rate limit exceeded");
    throw new Error(`Odds API error: ${res.status}`);
  }

  const data: OddsApiEvent = await res.json();
  const fixed = fixLinks([data])[0];

  eventOddsCache.set(cacheKey, { data: fixed, timestamp: Date.now() });

  return fixed;
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
