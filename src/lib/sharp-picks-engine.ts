/**
 * Sharp Picks pre-analysis engine.
 * Computes EV%, no-vig probabilities, and market disagreements
 * from raw odds data before sending to Claude for expert analysis.
 */

import {
  type OddsApiEvent,
  SHARP_BOOK,
  SHARP_PICKS_BOOKS,
  BOOK_DISPLAY_NAMES,
} from "./odds-api";
import {
  americanToImpliedProb,
  removeVig,
  removeVig3Way,
  removeVigNWay,
  calculateEV,
} from "./ev-engine";

// ── Types ───────────────────────────────────────────────────────────

export type SharpPickCategory = "main_lines" | "player_props" | "game_props" | "longshots";

export type SharpPick = {
  category: SharpPickCategory;
  market: string;
  marketLabel: string;
  pick: string;
  reasoning: string;
  confidence: "high" | "medium" | "speculative";
  bestBook: string;
  bestBookName: string;
  bestOdds: number;
  bestOddsFormatted: string;
  deepLink?: string;
  pinnacleOdds?: number;
  evPercent?: number;
};

export type SharpPicksResponse = {
  eventId: string;
  homeTeam: string;
  awayTeam: string;
  sportKey: string;
  sportDisplay: string;
  commenceTime: string;
  picks: SharpPick[];
  analysisNote: string;
  generatedAt: string;
};

// ── Market metadata ─────────────────────────────────────────────────

export const MARKET_LABELS: Record<string, string> = {
  h2h: "Moneyline",
  spreads: "Spread",
  totals: "Total",
  player_points: "Player Points",
  player_rebounds: "Player Rebounds",
  player_assists: "Player Assists",
  player_threes: "Player Threes Made",
  player_points_rebounds_assists: "Player PRA",
  player_blocks: "Player Blocks",
  player_steals: "Player Steals",
  btts: "Both Teams to Score",
  draw_no_bet: "Draw No Bet",
  player_goal_scorer_anytime: "Anytime Goalscorer",
};

const MARKET_CATEGORIES: Record<string, SharpPickCategory> = {
  h2h: "main_lines",
  spreads: "main_lines",
  totals: "main_lines",
  player_points: "player_props",
  player_rebounds: "player_props",
  player_assists: "player_props",
  player_threes: "player_props",
  player_points_rebounds_assists: "player_props",
  player_blocks: "player_props",
  player_steals: "player_props",
  btts: "game_props",
  draw_no_bet: "game_props",
  player_goal_scorer_anytime: "player_props",
};

// ── Pre-analysis types ──────────────────────────────────────────────

export type OutcomeAnalysis = {
  name: string;
  point?: number;
  label: string;
  pinnacleOdds?: number;
  noVigProb?: number;
  books: {
    bookKey: string;
    bookName: string;
    odds: number;
    impliedProb: number;
    evPercent?: number;
    link?: string;
  }[];
  bestUserBook?: {
    bookKey: string;
    bookName: string;
    odds: number;
    link?: string;
    evPercent?: number;
  };
  oddsRange: number;
};

export type MarketAnalysis = {
  marketKey: string;
  marketLabel: string;
  category: SharpPickCategory;
  outcomes: OutcomeAnalysis[];
};

// ── Core pre-analysis function ──────────────────────────────────────

export function analyzeEventOdds(event: OddsApiEvent): MarketAnalysis[] {
  const pinnacle = event.bookmakers.find((b) => b.key === SHARP_BOOK);
  const analyses: MarketAnalysis[] = [];

  // Collect all market keys
  const allMarketKeys = new Set<string>();
  for (const book of event.bookmakers) {
    for (const market of book.markets) {
      allMarketKeys.add(market.key);
    }
  }

  for (const marketKey of allMarketKeys) {
    const category = MARKET_CATEGORIES[marketKey] || "game_props";
    const marketLabel = MARKET_LABELS[marketKey] || marketKey;

    // Get Pinnacle's market for no-vig probabilities
    const pinnacleMarket = pinnacle?.markets.find((m) => m.key === marketKey);
    let noVigMap: Map<string, { prob: number; odds: number }> | undefined;

    if (pinnacleMarket && pinnacleMarket.outcomes.length >= 2) {
      noVigMap = new Map();
      const prices = pinnacleMarket.outcomes.map((o) => o.price);
      let probs: number[];

      if (prices.length === 2) {
        probs = removeVig(prices[0], prices[1]);
      } else if (prices.length === 3) {
        probs = removeVig3Way(prices[0], prices[1], prices[2]);
      } else {
        probs = removeVigNWay(prices);
      }

      pinnacleMarket.outcomes.forEach((o, i) => {
        const key = o.point !== undefined ? `${o.name}|${o.point}` : o.name;
        noVigMap!.set(key, { prob: probs[i], odds: o.price });
      });
    }

    // Collect outcomes across all books
    const outcomeMap = new Map<string, OutcomeAnalysis>();

    for (const book of event.bookmakers) {
      const bMarket = book.markets.find((m) => m.key === marketKey);
      if (!bMarket) continue;

      for (const outcome of bMarket.outcomes) {
        const key = outcome.point !== undefined
          ? `${outcome.name}|${outcome.point}`
          : outcome.name;

        if (!outcomeMap.has(key)) {
          const label = outcome.point !== undefined
            ? `${outcome.name} ${outcome.point > 0 ? "+" : ""}${outcome.point}`
            : outcome.name;

          const pinnData = noVigMap?.get(key);

          outcomeMap.set(key, {
            name: outcome.name,
            point: outcome.point,
            label,
            pinnacleOdds: pinnData?.odds,
            noVigProb: pinnData?.prob,
            books: [],
            oddsRange: 0,
          });
        }

        const analysis = outcomeMap.get(key)!;
        const isTargetBook = (SHARP_PICKS_BOOKS as readonly string[]).includes(book.key);
        const ev = analysis.noVigProb
          ? calculateEV(analysis.noVigProb, outcome.price)
          : undefined;

        const link = outcome.link || bMarket.link || book.link;

        analysis.books.push({
          bookKey: book.key,
          bookName: BOOK_DISPLAY_NAMES[book.key] || book.title,
          odds: outcome.price,
          impliedProb: americanToImpliedProb(outcome.price),
          evPercent: ev !== undefined ? Math.round(ev * 100) / 100 : undefined,
          link,
        });

        if (isTargetBook) {
          if (!analysis.bestUserBook || outcome.price > analysis.bestUserBook.odds) {
            analysis.bestUserBook = {
              bookKey: book.key,
              bookName: BOOK_DISPLAY_NAMES[book.key] || book.title,
              odds: outcome.price,
              link,
              evPercent: ev !== undefined ? Math.round(ev * 100) / 100 : undefined,
            };
          }
        }
      }
    }

    // Calculate odds range
    for (const analysis of outcomeMap.values()) {
      if (analysis.books.length > 1) {
        const prices = analysis.books.map((b) => b.odds);
        analysis.oddsRange = Math.max(...prices) - Math.min(...prices);
      }
    }

    const outcomes = Array.from(outcomeMap.values())
      .filter((o) => o.bestUserBook !== undefined);

    if (outcomes.length > 0) {
      analyses.push({ marketKey, marketLabel, category, outcomes });
    }
  }

  return analyses;
}

// ── Format analysis for Claude prompt ───────────────────────────────

export function formatAnalysisForPrompt(
  event: OddsApiEvent,
  analyses: MarketAnalysis[]
): string {
  const lines: string[] = [];

  lines.push(`GAME: ${event.away_team} @ ${event.home_team}`);
  lines.push(`SPORT: ${event.sport_title} (${event.sport_key})`);
  lines.push(`TIME: ${event.commence_time}`);
  lines.push("");

  for (const analysis of analyses) {
    lines.push(`=== ${analysis.marketLabel.toUpperCase()} (${analysis.marketKey}) ===`);

    for (const outcome of analysis.outcomes) {
      lines.push(`  ${outcome.label}:`);

      if (outcome.pinnacleOdds !== undefined && outcome.noVigProb !== undefined) {
        lines.push(
          `    Pinnacle: ${fmtOdds(outcome.pinnacleOdds)} | No-vig prob: ${(outcome.noVigProb * 100).toFixed(1)}%`
        );
      }

      const targetBooks = outcome.books.filter((b) =>
        (SHARP_PICKS_BOOKS as readonly string[]).includes(b.bookKey)
      );

      for (const book of targetBooks) {
        const evStr = book.evPercent !== undefined
          ? ` | EV: ${book.evPercent > 0 ? "+" : ""}${book.evPercent.toFixed(1)}%`
          : "";
        lines.push(`    ${book.bookName}: ${fmtOdds(book.odds)}${evStr}`);
      }

      if (outcome.oddsRange > 15) {
        lines.push(`    ** ODDS DISAGREEMENT: ${outcome.oddsRange} cent spread **`);
      }

      lines.push("");
    }
  }

  return lines.join("\n");
}

function fmtOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `${odds}`;
}
