import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const maxDuration = 60;

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports";

// Map odds-api sport keys to ESPN sport/league
const SPORT_TO_ESPN: Record<string, { sport: string; league: string }[]> = {
  basketball_nba: [{ sport: "basketball", league: "nba" }],
  basketball_ncaab: [
    { sport: "basketball", league: "mens-college-basketball" },
  ],
  soccer_epl: [{ sport: "soccer", league: "eng.1" }],
  soccer_usa_mls: [{ sport: "soccer", league: "usa.1" }],
  // Add more as needed
  soccer_spain_la_liga: [{ sport: "soccer", league: "esp.1" }],
  soccer_germany_bundesliga: [{ sport: "soccer", league: "ger.1" }],
  soccer_italy_serie_a: [{ sport: "soccer", league: "ita.1" }],
  soccer_france_ligue_one: [{ sport: "soccer", league: "fra.1" }],
  soccer_uefa_champs_league: [{ sport: "soccer", league: "uefa.champions" }],
  soccer_uefa_europa_league: [{ sport: "soccer", league: "uefa.europa" }],
};

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

async function fetchESPNScores(
  sport: string,
  league: string,
  dateStr: string
): Promise<ESPNEvent[]> {
  try {
    const url = `${ESPN_BASE}/${sport}/${league}/scoreboard?dates=${dateStr}`;
    const res = await fetch(url, { next: { revalidate: 60 } });
    if (!res.ok) return [];
    const data = await res.json();
    return data.events || [];
  } catch {
    return [];
  }
}

function formatCompletedGames(events: ESPNEvent[]): string {
  const completed = events.filter((e) => e.status.type.completed);
  if (completed.length === 0) return "";

  return completed
    .map((e) => {
      const comp = e.competitions[0];
      if (!comp) return null;
      const home = comp.competitors.find((c) => c.homeAway === "home");
      const away = comp.competitors.find((c) => c.homeAway === "away");
      if (!home || !away) return null;

      const winner = comp.competitors.find((c) => c.winner);
      const totalScore =
        parseInt(home.score || "0") + parseInt(away.score || "0");
      return `${away.team.displayName} ${away.score} @ ${home.team.displayName} ${home.score} (Total: ${totalScore}) — Winner: ${winner ? winner.team.displayName : "Draw"}`;
    })
    .filter(Boolean)
    .join("\n");
}

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 500 }
    );
  }

  // Find PENDING picks where game should be over (commenceTime + 4 hours < now)
  const cutoff = new Date(Date.now() - 4 * 60 * 60 * 1000);
  const pendingPicks = await prisma.trackedPick.findMany({
    where: {
      operatorId: session.operatorId,
      status: "PENDING",
      source: "smart",
      commenceTime: { lt: cutoff },
    },
    orderBy: { commenceTime: "desc" },
  });

  if (pendingPicks.length === 0) {
    return NextResponse.json({ settled: 0, message: "No picks to settle" });
  }

  // Collect unique sport+date combos to fetch scores
  const sportDates = new Map<string, Set<string>>();
  for (const pick of pendingPicks) {
    const espnMappings = SPORT_TO_ESPN[pick.sportKey!];
    if (!espnMappings) continue;
    const dateStr = pick.commenceTime!
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, "");
    for (const mapping of espnMappings) {
      const key = `${mapping.sport}:${mapping.league}`;
      if (!sportDates.has(key)) sportDates.set(key, new Set());
      sportDates.get(key)!.add(dateStr);
    }
  }

  // Fetch all relevant scores
  const allEvents: ESPNEvent[] = [];
  const fetchPromises: Promise<void>[] = [];
  for (const [key, dates] of sportDates.entries()) {
    const [sport, league] = key.split(":");
    for (const dateStr of dates) {
      fetchPromises.push(
        fetchESPNScores(sport, league, dateStr).then((events) => {
          allEvents.push(...events);
        })
      );
    }
  }
  await Promise.all(fetchPromises);

  // Deduplicate events
  const uniqueEvents = [
    ...new Map(allEvents.map((e) => [e.id, e])).values(),
  ];

  const scoresText = formatCompletedGames(uniqueEvents);
  if (!scoresText) {
    return NextResponse.json({
      settled: 0,
      message: "No completed games found for pending picks",
    });
  }

  // Build pick descriptions for AI
  const pickDescriptions = pendingPicks
    .map(
      (p) =>
        `ID: ${p.id} | "${p.pick}" | Market: ${p.marketLabel} | Game: ${p.awayTeam} @ ${p.homeTeam} | Odds: ${p.bestOdds} | Sport: ${p.sportDisplay}`
    )
    .join("\n");

  // Use Claude to match picks to results
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 2048,
    tools: [
      {
        name: "submit_settlements",
        description:
          "Submit settlement results for tracked picks based on completed game scores.",
        input_schema: {
          type: "object" as const,
          properties: {
            settlements: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  pickId: {
                    type: "string",
                    description: "The pick ID",
                  },
                  result: {
                    type: "string",
                    enum: ["WIN", "LOSS", "PUSH", "SKIP"],
                    description:
                      "WIN, LOSS, or PUSH based on game result. SKIP if cannot determine (player props without stats, game not found, etc.)",
                  },
                  reason: {
                    type: "string",
                    description:
                      "Brief explanation of the settlement determination",
                  },
                },
                required: ["pickId", "result", "reason"],
              },
            },
          },
          required: ["settlements"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "submit_settlements" },
    messages: [
      {
        role: "user",
        content: `You are settling sports bets based on completed game results.

COMPLETED GAME RESULTS:
${scoresText}

PICKS TO SETTLE:
${pickDescriptions}

For each pick, determine the result:
- MONEYLINE/H2H: Did the team win?
- SPREAD: Did the team cover the spread? (e.g. "Team -3.5" means team must win by 4+)
- TOTALS: Is the total score Over or Under the line?
- BTTS (Both Teams to Score): Did both teams score at least 1 goal?
- DRAW NO BET: Did the team win? If draw, it's a PUSH.
- DOUBLE CHANCE: Home/Draw, Away/Draw, or Home/Away — did the condition occur?
- PLAYER PROPS (points, rebounds, assists, shots, goals, cards): Mark as SKIP — you cannot determine individual player stats from scoreboard data alone.
- GOALSCORER bets: Mark as SKIP unless it's obvious from context.

Be conservative: if unsure, use SKIP. Only settle when you can confidently determine the result from the scores.`,
      },
    ],
  });

  const toolBlock = response.content.find(
    (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use"
  );

  if (!toolBlock) {
    return NextResponse.json({
      settled: 0,
      message: "AI returned no results",
    });
  }

  const parsed = toolBlock.input as {
    settlements: Array<{
      pickId: string;
      result: "WIN" | "LOSS" | "PUSH" | "SKIP";
      reason: string;
    }>;
  };

  // Apply settlements to DB
  let settledCount = 0;
  const results: Array<{
    pickId: string;
    result: string;
    reason: string;
  }> = [];

  for (const settlement of parsed.settlements) {
    if (settlement.result === "SKIP") {
      results.push(settlement);
      continue;
    }

    // Verify this pick belongs to the operator and is still PENDING
    const pick = pendingPicks.find((p) => p.id === settlement.pickId);
    if (!pick) continue;

    try {
      await prisma.trackedPick.update({
        where: { id: settlement.pickId },
        data: {
          status: "SETTLED",
          result: settlement.result,
          settledAt: new Date(),
        },
      });
      settledCount++;
      results.push(settlement);
    } catch {
      results.push({
        pickId: settlement.pickId,
        result: "SKIP",
        reason: "Database update failed",
      });
    }
  }

  return NextResponse.json({
    settled: settledCount,
    total: pendingPicks.length,
    results,
  });
}
