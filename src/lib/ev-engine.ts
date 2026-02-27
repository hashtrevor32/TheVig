/**
 * EV (Expected Value) calculation engine.
 * Pure math — no API calls, no side effects.
 *
 * Uses Pinnacle as the sharp benchmark for "true" probability.
 * Calculates EV%, finds arbitrage, and builds line comparisons.
 */

import {
  type OddsApiEvent,
  type OddsApiBookmaker,
  type OddsApiOutcome,
  SHARP_BOOK,
  USER_BOOKS,
  BOOK_DISPLAY_NAMES,
  sportDisplayName,
} from "./odds-api";

// ── Types ───────────────────────────────────────────────────────────

export type EVBet = {
  eventId: string;
  sport: string;
  sportDisplay: string;
  commenceTime: string;
  homeTeam: string;
  awayTeam: string;
  market: string; // "h2h" | "spreads" | "totals"
  outcomeName: string; // "Kansas City Chiefs", "Over", etc.
  point?: number; // -3.5, 215.5
  bookKey: string;
  bookName: string;
  bookOdds: number; // American odds at this book
  bookLink?: string; // Deep link to bet slip
  pinnacleOdds: number;
  noVigProb: number; // True probability (0-1)
  impliedProb: number; // This book's implied probability (0-1)
  evPercent: number; // EV%
  isUserBook: boolean;
  bestOdds: number; // Best available across all books
  bestOddsBook: string;
  bestOddsBookName: string;
  bestOddsLink?: string;
};

export type ArbLeg = {
  outcomeName: string;
  point?: number;
  bookKey: string;
  bookName: string;
  odds: number;
  impliedProb: number;
  stakePercent: number; // Optimal stake allocation (0-100)
  link?: string;
};

export type ArbOpportunity = {
  eventId: string;
  sport: string;
  sportDisplay: string;
  commenceTime: string;
  homeTeam: string;
  awayTeam: string;
  market: string;
  arbPercent: number; // Guaranteed profit %
  totalImpliedProb: number; // Sum of best implied probs (< 1 = arb)
  legs: ArbLeg[];
};

export type LineBookOdds = {
  bookKey: string;
  bookName: string;
  odds: number;
  impliedProb: number;
  isBest: boolean;
  isUserBook: boolean;
  link?: string;
};

export type LineCompare = {
  outcomeName: string;
  point?: number;
  books: LineBookOdds[];
};

export type GameOddsDetail = {
  eventId: string;
  sport: string;
  sportDisplay: string;
  commenceTime: string;
  homeTeam: string;
  awayTeam: string;
  markets: {
    key: string;
    lines: LineCompare[];
  }[];
};

// ── Core Math ───────────────────────────────────────────────────────

/** Convert American odds to implied probability (0-1) */
export function americanToImpliedProb(odds: number): number {
  if (odds < 0) return Math.abs(odds) / (Math.abs(odds) + 100);
  return 100 / (odds + 100);
}

/** Convert American odds to decimal odds */
export function americanToDecimal(odds: number): number {
  if (odds < 0) return 1 + 100 / Math.abs(odds);
  return 1 + odds / 100;
}

/** Remove vig from a 2-way market. Returns [noVigProb1, noVigProb2] */
export function removeVig(
  odds1: number,
  odds2: number
): [number, number] {
  const imp1 = americanToImpliedProb(odds1);
  const imp2 = americanToImpliedProb(odds2);
  const total = imp1 + imp2;
  return [imp1 / total, imp2 / total];
}

/** Remove vig from a 3-way market (soccer). Returns [prob1, prob2, prob3] */
export function removeVig3Way(
  odds1: number,
  odds2: number,
  odds3: number
): [number, number, number] {
  const imp1 = americanToImpliedProb(odds1);
  const imp2 = americanToImpliedProb(odds2);
  const imp3 = americanToImpliedProb(odds3);
  const total = imp1 + imp2 + imp3;
  return [imp1 / total, imp2 / total, imp3 / total];
}

/**
 * Calculate EV% for a bet.
 * trueProb = no-vig probability from Pinnacle (0-1)
 * odds = American odds at the book being evaluated
 * Returns EV as a percentage (e.g., 3.5 = +3.5% EV)
 */
export function calculateEV(trueProb: number, odds: number): number {
  const decimal = americanToDecimal(odds);
  return (trueProb * decimal - 1) * 100;
}

// ── Helpers ─────────────────────────────────────────────────────────

function findBookmaker(
  event: OddsApiEvent,
  bookKey: string
): OddsApiBookmaker | undefined {
  return event.bookmakers.find((b) => b.key === bookKey);
}

function getOutcomeLink(
  outcome: OddsApiOutcome,
  market: { link?: string },
  bookmaker: OddsApiBookmaker
): string | undefined {
  return outcome.link || market.link || bookmaker.link;
}

/**
 * Match outcomes across books by name and point.
 * For spreads/totals, outcomes must match both name AND point.
 * For h2h, just name.
 */
function outcomeKey(name: string, point?: number): string {
  if (point !== undefined) return `${name}|${point}`;
  return name;
}

// ── EV Finder ───────────────────────────────────────────────────────

export function findEVBets(
  events: OddsApiEvent[],
  minEV: number = 0
): EVBet[] {
  const evBets: EVBet[] = [];

  for (const event of events) {
    const pinnacle = findBookmaker(event, SHARP_BOOK);
    if (!pinnacle) continue; // Can't compute true prob without Pinnacle

    for (const pMarket of pinnacle.markets) {
      const marketKey = pMarket.key;
      const pOutcomes = pMarket.outcomes;

      if (pOutcomes.length < 2) continue;

      // Compute no-vig probabilities from Pinnacle
      let noVigProbs: number[];
      if (pOutcomes.length === 2) {
        noVigProbs = removeVig(pOutcomes[0].price, pOutcomes[1].price);
      } else if (pOutcomes.length === 3) {
        noVigProbs = removeVig3Way(
          pOutcomes[0].price,
          pOutcomes[1].price,
          pOutcomes[2].price
        );
      } else {
        // For markets with many outcomes (golf outrights), skip for now
        continue;
      }

      // Build a map of outcome name → no-vig prob and pinnacle odds
      const probMap = new Map<
        string,
        { noVigProb: number; pinnacleOdds: number }
      >();
      for (let i = 0; i < pOutcomes.length; i++) {
        const key = outcomeKey(pOutcomes[i].name, pOutcomes[i].point);
        probMap.set(key, {
          noVigProb: noVigProbs[i],
          pinnacleOdds: pOutcomes[i].price,
        });
      }

      // Find best odds per outcome across all books
      const bestOddsMap = new Map<
        string,
        { odds: number; bookKey: string; bookName: string; link?: string }
      >();
      for (const book of event.bookmakers) {
        const bMarket = book.markets.find((m) => m.key === marketKey);
        if (!bMarket) continue;
        for (const outcome of bMarket.outcomes) {
          const key = outcomeKey(outcome.name, outcome.point);
          const current = bestOddsMap.get(key);
          if (!current || outcome.price > current.odds) {
            bestOddsMap.set(key, {
              odds: outcome.price,
              bookKey: book.key,
              bookName: BOOK_DISPLAY_NAMES[book.key] || book.title,
              link: getOutcomeLink(outcome, bMarket, book),
            });
          }
        }
      }

      // Compute EV for each outcome at each non-Pinnacle book
      for (const book of event.bookmakers) {
        if (book.key === SHARP_BOOK) continue;

        const bMarket = book.markets.find((m) => m.key === marketKey);
        if (!bMarket) continue;

        for (const outcome of bMarket.outcomes) {
          const key = outcomeKey(outcome.name, outcome.point);
          const probData = probMap.get(key);
          if (!probData) continue;

          const ev = calculateEV(probData.noVigProb, outcome.price);
          if (ev < minEV) continue;

          const best = bestOddsMap.get(key);
          const isUser = (USER_BOOKS as readonly string[]).includes(
            book.key
          );

          evBets.push({
            eventId: event.id,
            sport: event.sport_key,
            sportDisplay: sportDisplayName(event.sport_key),
            commenceTime: event.commence_time,
            homeTeam: event.home_team,
            awayTeam: event.away_team,
            market: marketKey,
            outcomeName: outcome.name,
            point: outcome.point,
            bookKey: book.key,
            bookName: BOOK_DISPLAY_NAMES[book.key] || book.title,
            bookOdds: outcome.price,
            bookLink: getOutcomeLink(outcome, bMarket, book),
            pinnacleOdds: probData.pinnacleOdds,
            noVigProb: probData.noVigProb,
            impliedProb: americanToImpliedProb(outcome.price),
            evPercent: Math.round(ev * 100) / 100,
            isUserBook: isUser,
            bestOdds: best?.odds ?? outcome.price,
            bestOddsBook: best?.bookKey ?? book.key,
            bestOddsBookName: best?.bookName ?? book.title,
            bestOddsLink: best?.link,
          });
        }
      }
    }
  }

  // Sort by EV% descending
  evBets.sort((a, b) => b.evPercent - a.evPercent);

  return evBets;
}

// ── Arb Finder ──────────────────────────────────────────────────────

export function findArbs(events: OddsApiEvent[]): ArbOpportunity[] {
  const arbs: ArbOpportunity[] = [];

  for (const event of events) {
    for (const marketKey of ["h2h", "spreads", "totals"]) {
      // Collect all outcomes and find best odds per outcome
      const bestPerOutcome = new Map<
        string,
        {
          name: string;
          point?: number;
          odds: number;
          bookKey: string;
          bookName: string;
          link?: string;
        }
      >();

      for (const book of event.bookmakers) {
        const market = book.markets.find((m) => m.key === marketKey);
        if (!market) continue;

        for (const outcome of market.outcomes) {
          const key = outcomeKey(outcome.name, outcome.point);
          const current = bestPerOutcome.get(key);
          if (!current || outcome.price > current.odds) {
            bestPerOutcome.set(key, {
              name: outcome.name,
              point: outcome.point,
              odds: outcome.price,
              bookKey: book.key,
              bookName: BOOK_DISPLAY_NAMES[book.key] || book.title,
              link: getOutcomeLink(outcome, market, book),
            });
          }
        }
      }

      const outcomes = Array.from(bestPerOutcome.values());

      // Need at least 2 outcomes for an arb
      if (outcomes.length < 2) continue;

      // For spreads/totals: outcomes come in pairs by point value
      // For h2h: just 2-3 outcomes (home/away or home/draw/away)
      // We need to check that we have a complete set of outcomes

      // Group by point value for spreads/totals
      if (marketKey === "spreads" || marketKey === "totals") {
        const byPoint = new Map<number, typeof outcomes>();
        for (const o of outcomes) {
          const pt = o.point ?? 0;
          const group = byPoint.get(pt) || [];
          group.push(o);
          byPoint.set(pt, group);
        }

        for (const [, group] of byPoint) {
          if (group.length < 2) continue;
          checkArbGroup(event, marketKey, group, arbs);
        }
      } else {
        // h2h — check all outcomes together
        checkArbGroup(event, marketKey, outcomes, arbs);
      }
    }
  }

  // Sort by profit % descending
  arbs.sort((a, b) => b.arbPercent - a.arbPercent);

  return arbs;
}

function checkArbGroup(
  event: OddsApiEvent,
  marketKey: string,
  outcomes: {
    name: string;
    point?: number;
    odds: number;
    bookKey: string;
    bookName: string;
    link?: string;
  }[],
  arbs: ArbOpportunity[]
) {
  // Calculate sum of implied probabilities for best odds
  const totalImplied = outcomes.reduce(
    (sum, o) => sum + americanToImpliedProb(o.odds),
    0
  );

  // Arb exists if total < 1 (< 100%)
  if (totalImplied >= 1) return;

  const arbPercent =
    Math.round((1 / totalImplied - 1) * 100 * 100) / 100;

  // Only include if at least one leg is at a user book
  const hasUserBook = outcomes.some((o) =>
    (USER_BOOKS as readonly string[]).includes(o.bookKey)
  );
  if (!hasUserBook) return;

  // Calculate optimal stake distribution
  const legs: ArbLeg[] = outcomes.map((o) => {
    const decimal = americanToDecimal(o.odds);
    const stakePercent =
      Math.round(((1 / decimal / totalImplied) * 100) * 100) / 100;
    return {
      outcomeName: o.name,
      point: o.point,
      bookKey: o.bookKey,
      bookName: o.bookName,
      odds: o.odds,
      impliedProb: americanToImpliedProb(o.odds),
      stakePercent,
      link: o.link,
    };
  });

  arbs.push({
    eventId: event.id,
    sport: event.sport_key,
    sportDisplay: sportDisplayName(event.sport_key),
    commenceTime: event.commence_time,
    homeTeam: event.home_team,
    awayTeam: event.away_team,
    market: marketKey,
    arbPercent,
    totalImpliedProb: Math.round(totalImplied * 10000) / 10000,
    legs,
  });
}

// ── Line Shopping ───────────────────────────────────────────────────

export function buildLineComparison(event: OddsApiEvent): GameOddsDetail {
  const marketKeys = new Set<string>();
  for (const book of event.bookmakers) {
    for (const market of book.markets) {
      marketKeys.add(market.key);
    }
  }

  const markets: GameOddsDetail["markets"] = [];

  for (const marketKey of marketKeys) {
    // Collect all unique outcomes
    const outcomeMap = new Map<string, { name: string; point?: number }>();
    for (const book of event.bookmakers) {
      const market = book.markets.find((m) => m.key === marketKey);
      if (!market) continue;
      for (const o of market.outcomes) {
        const key = outcomeKey(o.name, o.point);
        if (!outcomeMap.has(key)) {
          outcomeMap.set(key, { name: o.name, point: o.point });
        }
      }
    }

    const lines: LineCompare[] = [];

    for (const [key, { name, point }] of outcomeMap) {
      // Find best odds for this outcome
      let bestOdds = -Infinity;
      const bookOdds: LineBookOdds[] = [];

      for (const book of event.bookmakers) {
        const market = book.markets.find((m) => m.key === marketKey);
        if (!market) continue;
        const outcome = market.outcomes.find(
          (o) => outcomeKey(o.name, o.point) === key
        );
        if (!outcome) continue;

        if (outcome.price > bestOdds) bestOdds = outcome.price;

        bookOdds.push({
          bookKey: book.key,
          bookName: BOOK_DISPLAY_NAMES[book.key] || book.title,
          odds: outcome.price,
          impliedProb: americanToImpliedProb(outcome.price),
          isBest: false, // Set below
          isUserBook: (USER_BOOKS as readonly string[]).includes(book.key),
          link: getOutcomeLink(outcome, market, book),
        });
      }

      // Mark best odds
      for (const bo of bookOdds) {
        bo.isBest = bo.odds === bestOdds;
      }

      lines.push({ outcomeName: name, point, books: bookOdds });
    }

    markets.push({ key: marketKey, lines });
  }

  return {
    eventId: event.id,
    sport: event.sport_key,
    sportDisplay: sportDisplayName(event.sport_key),
    commenceTime: event.commence_time,
    homeTeam: event.home_team,
    awayTeam: event.away_team,
    markets,
  };
}
