import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Allow up to 60s for this cron job (fetches many ESPN endpoints + AI call)
export const maxDuration = 60;

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports";

const SPORT_LEAGUES = [
  { sport: "football", league: "nfl" },
  { sport: "football", league: "college-football" },
  { sport: "football", league: "xfl" },
  { sport: "football", league: "cfl" },
  { sport: "football", league: "ufl" },
  { sport: "basketball", league: "nba" },
  { sport: "basketball", league: "mens-college-basketball" },
  { sport: "basketball", league: "wnba" },
  { sport: "basketball", league: "womens-college-basketball" },
  { sport: "basketball", league: "nba-development" },
  { sport: "baseball", league: "mlb" },
  { sport: "baseball", league: "college-baseball" },
  { sport: "hockey", league: "nhl" },
  { sport: "hockey", league: "mens-college-hockey" },
  { sport: "mma", league: "ufc" },
  { sport: "mma", league: "bellator" },
  { sport: "tennis", league: "atp" },
  { sport: "tennis", league: "wta" },
  { sport: "golf", league: "pga" },
  { sport: "golf", league: "lpga" },
  { sport: "golf", league: "liv" },
  { sport: "golf", league: "eur" },
  { sport: "racing", league: "f1" },
  { sport: "racing", league: "irl" },
  { sport: "racing", league: "nascar-truck" },
  { sport: "racing", league: "nhra" },
  { sport: "lacrosse", league: "pll" },
  { sport: "lacrosse", league: "nll" },
  { sport: "soccer", league: "usa.1" },
  { sport: "soccer", league: "eng.1" },
  { sport: "soccer", league: "esp.1" },
  { sport: "soccer", league: "ger.1" },
  { sport: "soccer", league: "ita.1" },
  { sport: "soccer", league: "fra.1" },
  { sport: "soccer", league: "mex.1" },
  { sport: "soccer", league: "por.1" },
  { sport: "soccer", league: "ned.1" },
  { sport: "soccer", league: "bra.1" },
  { sport: "soccer", league: "arg.1" },
  { sport: "soccer", league: "tur.1" },
  { sport: "soccer", league: "sco.1" },
  { sport: "soccer", league: "bel.1" },
  { sport: "soccer", league: "aus.1" },
  { sport: "soccer", league: "jpn.1" },
  { sport: "soccer", league: "eng.2" },
  { sport: "soccer", league: "esp.2" },
  { sport: "soccer", league: "ger.2" },
  { sport: "soccer", league: "ita.2" },
  { sport: "soccer", league: "fra.2" },
  { sport: "soccer", league: "uefa.champions" },
  { sport: "soccer", league: "uefa.europa" },
  { sport: "soccer", league: "uefa.europa.conf" },
  { sport: "soccer", league: "fifa.world" },
  { sport: "soccer", league: "conmebol.libertadores" },
  { sport: "soccer", league: "concacaf.champions_cup" },
  { sport: "soccer", league: "eng.fa" },
  { sport: "soccer", league: "eng.league_cup" },
  { sport: "soccer", league: "esp.copa_del_rey" },
  { sport: "soccer", league: "ger.dfb_pokal" },
  { sport: "soccer", league: "ita.coppa_italia" },
  { sport: "soccer", league: "fra.coupe_de_france" },
  { sport: "soccer", league: "usa.nwsl" },
  { sport: "soccer", league: "eng.w.1" },
];

type ESPNEvent = {
  id: string;
  name: string;
  shortName: string;
  date: string;
  status: {
    type: {
      completed: boolean;
      description: string;
    };
  };
  competitions: {
    competitors: {
      homeAway: string;
      winner?: boolean;
      score: string;
      team: {
        displayName: string;
        abbreviation: string;
        shortDisplayName: string;
      };
    }[];
  }[];
};

async function fetchScores(dateStr: string): Promise<ESPNEvent[]> {
  const allEvents: ESPNEvent[] = [];
  const fetches = SPORT_LEAGUES.map(async ({ sport, league }) => {
    try {
      const url = `${ESPN_BASE}/${sport}/${league}/scoreboard?dates=${dateStr}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (data.events && Array.isArray(data.events)) {
        allEvents.push(...data.events);
      }
    } catch {
      // Skip failed fetches silently
    }
  });
  await Promise.all(fetches);
  return allEvents;
}

function formatScoresForAI(events: ESPNEvent[]): string {
  const completed = events.filter(
    (e) => e.status?.type?.completed
  );
  if (completed.length === 0) return "No completed games found.";

  return completed
    .map((e) => {
      try {
        const comp = e.competitions?.[0];
        if (!comp?.competitors) return null;
        const home = comp.competitors.find((c) => c.homeAway === "home");
        const away = comp.competitors.find((c) => c.homeAway === "away");
        if (!home?.team || !away?.team) return null;

        const winner = comp.competitors.find((c) => c.winner);
        return `${away.team.displayName} (${away.team.abbreviation}) ${away.score} @ ${home.team.displayName} (${home.team.abbreviation}) ${home.score} — Winner: ${winner ? winner.team.displayName : "TBD/Draw"}`;
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .join("\n");
}

function calculatePayout(
  stakeCash: number,
  stakeFP: number,
  odds: number,
  result: "WIN" | "LOSS" | "PUSH"
): number {
  if (result === "LOSS") return 0;
  if (result === "PUSH") return stakeCash;
  // WIN
  const totalStake = stakeCash + stakeFP;
  if (odds > 0) {
    return totalStake + Math.round((totalStake * odds) / 100);
  }
  return totalStake + Math.round((totalStake * 100) / Math.abs(odds));
}

export async function GET(req: NextRequest) {
  // Verify cron secret — Vercel sends this header for cron jobs
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 500 }
    );
  }

  try {
    // Fetch ALL open bets across all open weeks
    const openBets = await prisma.bet.findMany({
      where: {
        status: "OPEN",
        week: { status: "OPEN" },
      },
      include: {
        member: { select: { name: true } },
        week: { select: { name: true, groupId: true } },
      },
    });

    if (openBets.length === 0) {
      return NextResponse.json({
        message: "No open bets to settle",
        settled: 0,
        checked: 0,
      });
    }

    // Fetch scores for last 3 days
    const datesToFetch: string[] = [];
    const today = new Date();
    for (let i = 0; i < 3; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      datesToFetch.push(d.toISOString().slice(0, 10).replace(/-/g, ""));
    }

    const allEvents: ESPNEvent[] = [];
    const fetchResults = await Promise.all(
      datesToFetch.map((d) => fetchScores(d))
    );
    for (const events of fetchResults) {
      allEvents.push(...events);
    }

    // Deduplicate by event ID
    const uniqueEvents = [
      ...new Map(allEvents.map((e) => [e.id, e])).values(),
    ];

    const scoresText = formatScoresForAI(uniqueEvents);

    if (scoresText === "No completed games found.") {
      return NextResponse.json({
        message: "No completed games found",
        settled: 0,
        checked: openBets.length,
        gamesChecked: 0,
      });
    }

    // Build bet descriptions for AI
    const betDescriptions = openBets
      .map(
        (b) =>
          `ID: ${b.id} | "${b.description}" | Odds: ${b.oddsAmerican} | Stake: ${b.stakeCashUnits}${b.eventKey ? ` | Event: ${b.eventKey}` : ""}`
      )
      .join("\n");

    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: `You are a sports betting settlement assistant. Match open bets to completed game results and determine the outcome.

COMPLETED GAME RESULTS:
${scoresText}

OPEN BETS TO SETTLE:
${betDescriptions}

For each bet, determine if it is a WIN, LOSS, or PUSH based on the game results. Consider:
- Spread bets (e.g. "Chiefs -3.5"): The team must win by more than the spread
- Moneyline bets (e.g. "Lakers ML"): The team must win the game outright
- Over/Under bets (e.g. "Over 215.5"): Compare total combined score to the line
- Player props, parlays, and exotic bets that you cannot determine from scores alone should be marked as "SKIP"
- Casino bets (blackjack, roulette, slots) should always be marked as "SKIP"

IMPORTANT: This is an automated system that will settle bets without human review. Be VERY conservative:
- Only suggest WIN/LOSS/PUSH when you are 100% confident in the match
- If there is ANY ambiguity, use "SKIP"
- Make sure you match the correct game — verify team names carefully
- Double check spread/total calculations

Respond ONLY with valid JSON, no other text:
{
  "suggestions": [
    {
      "betId": "string",
      "result": "WIN" | "LOSS" | "PUSH" | "SKIP",
      "reason": "Brief explanation"
    }
  ]
}`,
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json({
        message: "AI returned no response",
        settled: 0,
        checked: openBets.length,
      });
    }

    let jsonStr = textBlock.text.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const parsed = JSON.parse(jsonStr);
    const suggestions: { betId: string; result: string; reason: string }[] =
      parsed.suggestions || [];

    // Only settle WIN/LOSS/PUSH — skip everything else
    const toSettle = suggestions.filter(
      (s) => s.result === "WIN" || s.result === "LOSS" || s.result === "PUSH"
    );

    if (toSettle.length === 0) {
      return NextResponse.json({
        message: "No confident matches found",
        settled: 0,
        checked: openBets.length,
        gamesChecked: uniqueEvents.filter((e) => e.status.type.completed)
          .length,
        skipped: suggestions.filter((s) => s.result === "SKIP").length,
      });
    }

    // Settle matched bets
    const now = new Date();
    const settledResults: { betId: string; result: string; reason: string }[] = [];

    for (const suggestion of toSettle) {
      const bet = openBets.find((b) => b.id === suggestion.betId);
      if (!bet) continue;

      const result = suggestion.result as "WIN" | "LOSS" | "PUSH";
      const payoutCashUnits = calculatePayout(
        bet.stakeCashUnits,
        bet.stakeFreePlayUnits,
        bet.oddsAmerican,
        result
      );

      await prisma.bet.update({
        where: { id: bet.id },
        data: {
          status: "SETTLED",
          result,
          payoutCashUnits,
          settledAt: now,
        },
      });

      settledResults.push({
        betId: bet.id,
        result: suggestion.result,
        reason: suggestion.reason,
      });
    }

    return NextResponse.json({
      message: `Auto-settled ${settledResults.length} bet(s)`,
      settled: settledResults.length,
      checked: openBets.length,
      gamesChecked: uniqueEvents.filter((e) => e.status.type.completed).length,
      skipped: suggestions.filter((s) => s.result === "SKIP").length,
      results: settledResults,
    });
  } catch (err) {
    console.error("Cron auto-settle error:", err);
    return NextResponse.json(
      {
        error: "Auto-settle cron failed",
        details: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
