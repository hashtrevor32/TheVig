import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { description, weekStart, weekEnd } = await req.json();

  if (!description) {
    return NextResponse.json(
      { error: "Missing description" },
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
    const response = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: `You are a betting pool promo parser for a private sports betting pool. Parse the operator's rough promo description(s) into clean, structured rules. Clean up their language, fix typos, and make the promo names professional.

The week runs from ${weekStart} to ${weekEnd}.

The only supported promo type is LOSS_REBATE — members get a percentage of their NET LOSSES back as free play if they meet a minimum betting handle.

=== HOUSE PROTECTION RULES (MANDATORY — apply these even if the operator doesn't mention them) ===

1. ODDS MINIMUM: ALWAYS default oddsMin to -200 unless the operator specifies differently.
2. NET LOSS REBATE: Rebate is always on NET losses (wins offset losses). Include "Net Loss" in the promo name.
3. BOTH-SIDES DQ: ALWAYS default disqualifyBothSides to true.
4. REBATE CAP: If no cap mentioned, default to 300. NEVER exceed 500.
5. MINIMUM HANDLE: If not mentioned, default to 250 for sport-wide, 100 for single-game.
6. EXCLUDED BET TYPES: NEVER use "parlay", "live", or "prop" as betType.
7. For team sports "sides" promos, use betType "moneyline,spread" (comma-separated).
8. windowEnd must be end of last day (23:59:59), NOT midnight.

=== PARSING RULES ===

IMPORTANT: Promos usually target a SPECIFIC sport AND/OR a specific bet type. For example:
- "50% golf outright loss rebate" → sport: "golf", betType: "outright"
- "30% NFL sides" → sport: "nfl", betType: "moneyline,spread"
- "25% PGA matchup rebate" → sport: "golf", betType: "matchup"
- "give them 40% back on college hoops" → sport: "college-basketball", betType: "moneyline,spread"
- "hockey 50 percent back" → sport: "nhl", betType: "moneyline,spread"

You MUST create SEPARATE promos for each distinct sport+betType combination mentioned.

Clean up the operator's input:
- Fix spelling/grammar
- Make names professional: "50% NBA Sides Net Loss Rebate" not "nba 50 prcent back"
- Infer sport and betType from casual language ("hoops" = college-basketball or nba, "sides" = moneyline,spread, "totals" = total)
- If they say something vague like "give them 30% back on basketball", create a clean promo with proper defaults

Sport values: "golf", "nfl", "nba", "mlb", "nhl", "soccer", "tennis", "ufc", "college-football", "college-basketball", "f1", "nascar"
BetType values: "outright", "matchup", "round-leader", "top-finish", "spread", "moneyline", "total", "3-ball". Comma-separate for multiple (e.g. "moneyline,spread"). NEVER use "parlay", "live", or "prop".

Description from operator:
${description}

Respond ONLY with valid JSON:
{
  "promos": [
    {
      "name": "string - MUST include 'Net Loss' in name",
      "type": "LOSS_REBATE",
      "ruleJson": {
        "windowStart": "string",
        "windowEnd": "string",
        "minHandleUnits": number (default 250),
        "percentBack": number,
        "capUnits": number (default 300, max 500),
        "oddsMin": -200,
        "oddsMax": null,
        "disqualifyBothSides": true,
        "sport": "string or null",
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
      return NextResponse.json({ promos: [] });
    }

    let jsonStr = textBlock.text.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const parsed = JSON.parse(jsonStr);
    return NextResponse.json(parsed);
  } catch (err) {
    console.error("Parse promos error:", err);
    return NextResponse.json(
      { error: "Failed to parse promos" },
      { status: 500 }
    );
  }
}
