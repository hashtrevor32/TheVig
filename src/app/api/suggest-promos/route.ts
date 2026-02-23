import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { fetchUpcomingEvents, formatEventsForPrompt } from "@/lib/sports-api";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { weekStart, weekEnd, userEvents, existingPromoNames } =
    await req.json();

  if (!weekStart || !weekEnd) {
    return NextResponse.json(
      { error: "Missing weekStart or weekEnd" },
      { status: 400 }
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 500 }
    );
  }

  const client = new Anthropic({ apiKey });

  try {
    // Fetch real sports events from ESPN
    const events = await fetchUpcomingEvents(
      new Date(weekStart),
      new Date(weekEnd)
    );

    const eventsText = formatEventsForPrompt(events);

    const existingList =
      existingPromoNames && existingPromoNames.length > 0
        ? `\n\nAlready existing promos (DO NOT suggest duplicates of these):\n${existingPromoNames.map((n: string) => `- ${n}`).join("\n")}`
        : "";

    const userEventsText = userEvents
      ? `\n\nAdditional events described by the operator:\n${userEvents}`
      : "";

    const response = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 8000,
      messages: [
        {
          role: "user",
          content: `You are a betting pool promo designer for a private betting pool. Your #1 priority is PROTECTING THE HOUSE from exploitation while still making promos attractive enough to drive action. Based on the upcoming sports events, suggest promos with tight, clear terms that can't be gamed.

Week: ${weekStart} to ${weekEnd}

Upcoming Events (from ESPN):
${eventsText}${userEventsText}${existingList}

=== HOUSE PROTECTION RULES (MANDATORY — every promo MUST follow ALL of these) ===

1. ODDS MINIMUM: ALWAYS set oddsMin to -200. This prevents members from loading up on massive favorites (-500, -1000) where loss risk is tiny but they pad their handle to qualify. Members must take real risk.

2. NET LOSS REBATE: The rebate % applies to the member's NET P&L on eligible bets (wins offset losses). If a member bets 1000 and wins back 700, their net loss is 300 — rebate applies to 300, NOT to the full 1000. If they're net positive on eligible bets, they get $0 rebate. This is enforced in code.

3. BOTH-SIDES DISQUALIFICATION: ALWAYS set disqualifyBothSides to true. If a member bets both sides of the same event (e.g. Team A spread AND Team B spread), they are FULLY DISQUALIFIED from the entire promo — not just that game, the ENTIRE promo. This prevents hedging/arbing within the promo.

4. REBATE CAP: ALWAYS set a capUnits that limits max house payout per member per promo. Use 100-300 for regular events, up to 500 for major championships or single-game promos. ABSOLUTE MAX is 500 — NEVER exceed 500 on any promo. This is the hard ceiling no matter how much they lose.

5. MINIMUM HANDLE: Set minHandleUnits high enough that members must put meaningful money at risk. Use 250-750 for regular sports, 500-1000 for popular sports with heavy action. Don't make it easy to qualify.

6. EXCLUDED BET TYPES — NEVER use these as eligible betTypes:
   - "parlay" — too easy to construct low-risk parlays that inflate handle
   - "live" — members can exploit closing line value and mid-game information
   - "prop" — prop markets have wider lines that can be arbitraged
   Only use: "outright", "matchup", "round-leader", "top-finish", "spread", "moneyline", "total", "3-ball"

7. FREE PLAY EXCLUDED: Bets placed with free play credits (stakeCashUnits = 0) do NOT count toward handle or losses. Only real cash bets count. This is enforced in code.

8. SPECIFIC TARGETING: Every promo must target a SPECIFIC sport AND bet type. No generic "all sports" or "any bet" promos — those are too easy to exploit across correlated markets.

9. CONSERVATIVE PERCENTAGES: Use 25-50% rebate for regular events. Only go up to 75% for truly major events (Super Bowl, March Madness Final Four, Masters, World Series). The higher the %, the more the house risks.

=== PROMO DESIGN GUIDELINES ===

PROMO NAMING: Always include "Net Loss" in the promo name to make it crystal clear. Example: "50% PGA Genesis Outright Net Loss Rebate", "25% NBA Sides Net Loss Rebate". This makes it unambiguous that the rebate is on net losses, not total losing stake.

MINIMUM 15 PROMOS TOTAL. You MUST suggest at least 15 promos. Mix of sport-wide and single-game promos.

SPORT-WIDE PROMOS (8-10 promos):
- Suggest promos targeting different sport+betType combinations across the whole week
- ONLY suggest promos for sports with events this week
- For golf: outright + matchup promos (these are high-margin for the house)
- For team sports (NFL/NBA/NHL/college): use betType "moneyline,spread" to cover sides. Also suggest separate "total" promos for popular sports.
- For soccer: moneyline promos
- For UFC/MMA: moneyline promos
- Cover as many active sports as possible — if there are NBA, NHL, college basketball, golf, soccer games, each should have at least one promo
- Vary the percentBack and minHandleUnits across promos to create different tiers (e.g. a lower % with lower min handle AND a higher % with higher min handle for the same sport)

SINGLE-GAME PROMOS (5-8 promos):
- Identify the BIGGEST/MARQUEE games of the week (rivalry games, nationally televised, playoff implications, ranked matchups, top-25 college matchups)
- Create single-game promos for as many marquee games as possible
- Single-game promos should have LOWER minHandleUnits (100-300) since it's just one game
- Use higher percentBack (40-75%) to make them attractive since it's limited to one game
- Set windowStart and windowEnd to just cover that game day (start of day to 23:59:59)
- Name should include the specific matchup, e.g. "50% Lakers vs Celtics Sides Net Loss Rebate"

GENERAL RULES:
- windowEnd must be end of last day (23:59:59), NOT midnight
- For "sides" promos, use betType "moneyline,spread" (comma-separated)
- capUnits MAXIMUM is 500 on ANY promo — this is a hard cap
- NEVER suggest promos for exhibitions, spring training, preseason, All-Star games, or Pro Bowl. Only regular season and postseason games.

Sport values: "golf", "nfl", "nba", "mlb", "nhl", "soccer", "tennis", "ufc", "college-football", "college-basketball", "f1", "nascar"
BetType values: "outright", "matchup", "round-leader", "top-finish", "spread", "moneyline", "total", "3-ball". Comma-separate for multiple (e.g. "moneyline,spread"). NEVER use "parlay", "live", or "prop".

Respond ONLY with valid JSON:
{
  "promos": [
    {
      "name": "string - MUST include 'Net Loss' in name, e.g. '50% PGA Genesis Outright Net Loss Rebate'",
      "type": "LOSS_REBATE",
      "ruleJson": {
        "windowStart": "${weekStart}",
        "windowEnd": "${weekEnd}",
        "minHandleUnits": number,
        "percentBack": number (25-50 for regular sport-wide, 40-75 for single-game or majors),
        "capUnits": number (100-500, NEVER exceed 500),
        "oddsMin": -200,
        "oddsMax": null,
        "disqualifyBothSides": true,
        "sport": "string",
        "betType": "string (NEVER parlay/live/prop)"
      }
    }
  ]
}`,
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json({ promos: [], events });
    }

    let jsonStr = textBlock.text.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr
        .replace(/^```(?:json)?\n?/, "")
        .replace(/\n?```$/, "");
    }

    const parsed = JSON.parse(jsonStr);
    return NextResponse.json({ ...parsed, events });
  } catch (err) {
    console.error("Suggest promos error:", err);
    return NextResponse.json(
      { error: "Failed to suggest promos" },
      { status: 500 }
    );
  }
}
