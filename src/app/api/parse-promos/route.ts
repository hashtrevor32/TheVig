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
          content: `You are a betting pool promo parser. Parse the following promo description(s) into structured rules.

The week runs from ${weekStart} to ${weekEnd}.

Currently the only supported promo type is LOSS_REBATE — where members get a percentage of their losses back as free play if they meet a minimum betting handle.

IMPORTANT: Promos usually target a SPECIFIC sport AND/OR a specific bet type. For example:
- "50% golf outright loss rebate" → sport: "golf", betType: "outright"
- "30% NFL moneyline rebate" → sport: "nfl", betType: "moneyline"
- "25% PGA tournament matchup rebate" → sport: "golf", betType: "matchup"
- "Golf 1st round leader 30% back" → sport: "golf", betType: "round-leader"
- "NBA player props 40% loss rebate" → sport: "nba", betType: "prop"
- "50% loss rebate on all bets" → sport: null, betType: null

You MUST create SEPARATE promos for each distinct sport+betType combination mentioned. For example, "50% golf outright rebate and 30% golf matchup rebate" should produce TWO separate promos, not one.

For each promo found, extract:
- name: A short descriptive name (e.g. "50% Golf Outright Loss Rebate", "NFL ML 30% Back")
- type: Always "LOSS_REBATE" for now
- ruleJson: An object with these fields:
  - windowStart: "${weekStart}" (ISO datetime, default to week start)
  - windowEnd: "${weekEnd}" (ISO datetime, default to week end)
  - minHandleUnits: minimum total units bet to qualify (number, default 0 if not mentioned)
  - percentBack: percentage of losses returned as free play (number, e.g. 50 for 50%)
  - capUnits: maximum free play award per member (number, default 9999 if no cap mentioned)
  - oddsMin: minimum American odds or null if no restriction
  - oddsMax: maximum American odds or null if no restriction
  - disqualifyBothSides: true if the promo mentions disqualifying members who bet both sides, false otherwise (default true)
  - sport: The sport/league this promo applies to as a lowercase string, or null if it applies to all sports. Examples: "golf", "nfl", "nba", "mlb", "nhl", "soccer", "tennis", "ufc", "mma", "boxing", "cricket", "f1", "nascar", "college-football", "college-basketball", "esports", "casino"
  - betType: The specific bet type this promo applies to as a lowercase string, or null if it applies to all bet types within the sport. Examples: "outright" (tournament/futures winner), "matchup" (head-to-head), "round-leader" (1st/2nd/3rd round leader), "top-finish" (top 5/10/20), "spread" (point spread), "moneyline" (straight win/ML), "total" (over/under), "prop" (player/team prop), "futures" (season futures), "parlay", "live", "3-ball" (golf 3-ball matchup)

If a promo doesn't clearly map to a loss rebate (e.g. "25 free play for 3+ bets"), still create it as LOSS_REBATE with your best interpretation:
- For flat bonuses (e.g. "25 free play"), set percentBack to 100 and capUnits to the bonus amount
- For bet count thresholds, set minHandleUnits to a reasonable equivalent

Description:
${description}

Respond ONLY with valid JSON:
{
  "promos": [
    {
      "name": "string",
      "type": "LOSS_REBATE",
      "ruleJson": {
        "windowStart": "string",
        "windowEnd": "string",
        "minHandleUnits": number,
        "percentBack": number,
        "capUnits": number,
        "oddsMin": number | null,
        "oddsMax": number | null,
        "disqualifyBothSides": boolean,
        "sport": "string or null",
        "betType": "string or null"
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
