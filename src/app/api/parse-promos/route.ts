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

For each promo found, extract:
- name: A short descriptive name (e.g. "50% Loss Rebate")
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
        "disqualifyBothSides": boolean
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
