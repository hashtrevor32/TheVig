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
      max_tokens: 3000,
      messages: [
        {
          role: "user",
          content: `You are a betting pool promo designer for a private betting pool. Based on the upcoming sports events for this week, suggest exciting promos that the pool operator can run.

Week: ${weekStart} to ${weekEnd}

Upcoming Events (from ESPN):
${eventsText}${userEventsText}${existingList}

IMPORTANT RULES:
- Suggest 4-8 promos targeting different sport+betType combinations based on the events above
- ONLY suggest promos for sports that actually have events this week (don't suggest NFL promos if no NFL games)
- Each promo must target a SPECIFIC sport AND bet type (not generic "all sports" promos)
- Use realistic loss rebate structures for a private pool:
  - percentBack: 25-75% (higher for premium/marquee events)
  - minHandleUnits: 200-1000 units (lower barrier for niche events, higher for popular sports)
  - capUnits: 50-500 units per member
- For golf tournaments: suggest outright winner + tournament matchup promos (maybe round leader too)
- For NFL/NBA/NHL: suggest spread, moneyline, and/or player prop promos
- For UFC fights: suggest moneyline promos
- For major/marquee events (playoffs, championship games, golf majors), suggest enhanced promos (higher %, higher caps)
- Set disqualifyBothSides to true for all promos
- Set oddsMin and oddsMax to null unless there's a specific reason
- Use the week start/end as windowStart/windowEnd

Sport values: "golf", "nfl", "nba", "mlb", "nhl", "soccer", "tennis", "ufc", "college-football", "college-basketball", "f1", "nascar"
BetType values: "outright" (winner/futures), "matchup" (head-to-head), "round-leader", "top-finish", "spread", "moneyline", "total" (over/under), "prop" (player/team prop), "futures", "parlay", "live", "3-ball"

Respond ONLY with valid JSON:
{
  "promos": [
    {
      "name": "string - short descriptive name like '50% PGA Genesis Outright Rebate'",
      "type": "LOSS_REBATE",
      "ruleJson": {
        "windowStart": "${weekStart}",
        "windowEnd": "${weekEnd}",
        "minHandleUnits": number,
        "percentBack": number,
        "capUnits": number,
        "oddsMin": null,
        "oddsMax": null,
        "disqualifyBothSides": true,
        "sport": "string",
        "betType": "string"
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
