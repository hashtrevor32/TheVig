import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

// Allow up to 60s for ESPN fetches + AI call
export const maxDuration = 60;

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports";

// All verified ESPN scoreboard endpoints
const SPORT_LEAGUES = [
  // Football
  { sport: "football", league: "nfl" },
  { sport: "football", league: "college-football" },
  { sport: "football", league: "xfl" },
  { sport: "football", league: "cfl" },
  { sport: "football", league: "ufl" },
  // Basketball
  { sport: "basketball", league: "nba" },
  { sport: "basketball", league: "mens-college-basketball" },
  { sport: "basketball", league: "wnba" },
  { sport: "basketball", league: "womens-college-basketball" },
  { sport: "basketball", league: "nba-development" },
  // Baseball
  { sport: "baseball", league: "mlb" },
  { sport: "baseball", league: "college-baseball" },
  // Hockey
  { sport: "hockey", league: "nhl" },
  { sport: "hockey", league: "mens-college-hockey" },
  // MMA
  { sport: "mma", league: "ufc" },
  { sport: "mma", league: "bellator" },
  // Tennis
  { sport: "tennis", league: "atp" },
  { sport: "tennis", league: "wta" },
  // Golf
  { sport: "golf", league: "pga" },
  { sport: "golf", league: "lpga" },
  { sport: "golf", league: "liv" },
  { sport: "golf", league: "eur" },
  // Racing
  { sport: "racing", league: "f1" },
  { sport: "racing", league: "irl" },
  { sport: "racing", league: "nascar-truck" },
  { sport: "racing", league: "nhra" },
  // Lacrosse
  { sport: "lacrosse", league: "pll" },
  { sport: "lacrosse", league: "nll" },
  // Soccer — Top Leagues
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
  // Soccer — Second Divisions
  { sport: "soccer", league: "eng.2" },
  { sport: "soccer", league: "esp.2" },
  { sport: "soccer", league: "ger.2" },
  { sport: "soccer", league: "ita.2" },
  { sport: "soccer", league: "fra.2" },
  // Soccer — International & Cups
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
  // Soccer — Women's
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
      const res = await fetch(url, { next: { revalidate: 60 } });
      if (!res.ok) return;
      const data = await res.json();
      if (data.events) {
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
  const completed = events.filter((e) => e.status.type.completed);
  if (completed.length === 0) return "No completed games found.";

  return completed
    .map((e) => {
      const comp = e.competitions[0];
      if (!comp) return null;
      const home = comp.competitors.find((c) => c.homeAway === "home");
      const away = comp.competitors.find((c) => c.homeAway === "away");
      if (!home || !away) return null;

      const winner = comp.competitors.find((c) => c.winner);
      return `${away.team.displayName} (${away.team.abbreviation}) ${away.score} @ ${home.team.displayName} (${home.team.abbreviation}) ${home.score} — Winner: ${winner ? winner.team.displayName : "TBD/Draw"}`;
    })
    .filter(Boolean)
    .join("\n");
}

export async function POST(req: NextRequest) {
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

  const { bets, dates } = await req.json();

  if (!bets || !Array.isArray(bets) || bets.length === 0) {
    return NextResponse.json(
      { error: "No bets provided" },
      { status: 400 }
    );
  }

  // Fetch scores for provided dates (or last 3 days as default)
  const datesToFetch: string[] = dates || [];
  if (datesToFetch.length === 0) {
    const today = new Date();
    for (let i = 0; i < 3; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      datesToFetch.push(
        d.toISOString().slice(0, 10).replace(/-/g, "")
      );
    }
  }

  try {
    // Fetch all scores in parallel
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
        suggestions: [],
        message: "No completed games found for the date range.",
        gamesChecked: 0,
      });
    }

    // Build bet descriptions for AI
    const betDescriptions = bets
      .map(
        (b: { id: string; description: string; oddsAmerican: number; stakeCashUnits: number; eventKey?: string }) =>
          `ID: ${b.id} | "${b.description}" | Odds: ${b.oddsAmerican} | Stake: ${b.stakeCashUnits}${b.eventKey ? ` | Event: ${b.eventKey}` : ""}`
      )
      .join("\n");

    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 2048,
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

Respond ONLY with valid JSON, no other text:
{
  "suggestions": [
    {
      "betId": "string",
      "result": "WIN" | "LOSS" | "PUSH" | "SKIP",
      "reason": "Brief explanation of why this result was determined",
      "matchedGame": "Short game description if matched, null if not"
    }
  ]
}

If a bet cannot be matched to any game result, use "SKIP" as the result with reason "No matching game found".
If a bet is ambiguous or you're not confident, use "SKIP" with the reason explaining why.
Be conservative — only suggest WIN/LOSS/PUSH when you are confident in the match.`,
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json({ suggestions: [], gamesChecked: uniqueEvents.length });
    }

    let jsonStr = textBlock.text.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const parsed = JSON.parse(jsonStr);
    return NextResponse.json({
      ...parsed,
      gamesChecked: uniqueEvents.filter((e) => e.status.type.completed).length,
    });
  } catch (err) {
    console.error("Auto-settle error:", err);
    return NextResponse.json(
      { error: "Failed to fetch scores or match bets", suggestions: [] },
      { status: 500 }
    );
  }
}
