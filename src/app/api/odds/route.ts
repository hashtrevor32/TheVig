import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  fetchOddsForSport,
  fetchOddsForAllActiveSports,
  SPORT_MAP,
  getCreditStats,
  getCacheInfo,
} from "@/lib/odds-api";
import { findEVBets, findArbs, buildLineComparison } from "@/lib/ev-engine";

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const sport = searchParams.get("sport"); // internal key like "nba" or odds-api key
  const mode = searchParams.get("mode") || "ev"; // "ev" | "arbs" | "lines"
  const eventId = searchParams.get("eventId");
  const markets = searchParams.get("markets")?.split(",") || ["h2h"];

  try {
    let events;

    if (sport && sport !== "all") {
      // Find the sport config
      const config = SPORT_MAP.find(
        (s) => s.internalKey === sport || s.oddsApiKey === sport
      );
      if (!config) {
        return NextResponse.json(
          { error: "Invalid sport" },
          { status: 400 }
        );
      }
      events = await fetchOddsForSport(config.oddsApiKey, markets);
    } else {
      events = await fetchOddsForAllActiveSports(markets);
    }

    const credits = getCreditStats();
    const cacheKey = sport && sport !== "all"
      ? `${SPORT_MAP.find((s) => s.internalKey === sport || s.oddsApiKey === sport)?.oddsApiKey}:${markets.join(",")}`
      : "all";
    const cache = getCacheInfo(cacheKey);

    if (mode === "arbs") {
      const arbs = findArbs(events);
      return NextResponse.json({
        arbs,
        totalEvents: events.length,
        lastUpdated: new Date().toISOString(),
        credits,
        fromCache: cache.valid,
        cacheAgeMs: cache.ageMs,
      });
    }

    if (mode === "lines" && eventId) {
      // For line shopping, we may need to fetch with additional markets
      const event = events.find((e) => e.id === eventId);
      if (!event) {
        // Try fetching with the requested markets for this sport
        const sportKey = searchParams.get("sportKey");
        if (sportKey) {
          const freshEvents = await fetchOddsForSport(sportKey, markets);
          const freshEvent = freshEvents.find((e) => e.id === eventId);
          if (freshEvent) {
            const detail = buildLineComparison(freshEvent);
            return NextResponse.json({ detail, credits });
          }
        }
        return NextResponse.json(
          { error: "Event not found" },
          { status: 404 }
        );
      }
      const detail = buildLineComparison(event);
      return NextResponse.json({ detail, credits });
    }

    // Default: EV mode
    const evBets = findEVBets(events);
    return NextResponse.json({
      bets: evBets,
      totalEvents: events.length,
      lastUpdated: new Date().toISOString(),
      credits,
      fromCache: cache.valid,
      cacheAgeMs: cache.ageMs,
    });
  } catch (err) {
    console.error("Odds API error:", err);
    const message =
      err instanceof Error ? err.message : "Failed to fetch odds";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
