import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { text } = await req.json();

  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return NextResponse.json(
      { error: "Missing text" },
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
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: `Analyze this pasted text from a betting app or sportsbook. It contains bet history or active bets. Extract ALL individual bets shown. The text may include sports bets AND casino bets — treat casino bets the same way (extract description, odds, stake).

For each bet, provide:
- description: The bet description (e.g. "Chiefs -3.5", "Lakers ML", "Over 45.5", "Blackjack Hand #123", "Roulette - Red")
- oddsAmerican: The American odds as a number. If decimal odds are shown, convert to American. For casino bets without clear odds, use -110 as default.
- stake: The wager/stake amount as a number (units, not dollars). If not visible, use 0.
- eventKey: A short identifier for the game/event (e.g. "chiefs-bills-feb17", "casino-blackjack"). Use lowercase with hyphens.
- placedAt: The exact date/time the bet was placed if visible (e.g. "2/17/2026 3:45:12 PM"). Include seconds if shown. If not visible, use null.

If a parlay/multi-leg bet is shown, extract it as a single bet with the combined description listing all legs.

Respond ONLY with valid JSON in this exact format, no other text:
{
  "bets": [
    {
      "description": "string",
      "oddsAmerican": number,
      "stake": number,
      "eventKey": "string",
      "placedAt": "string or null"
    }
  ]
}

If you cannot identify any bets, respond with: {"bets": []}

TEXT TO PARSE:
${text}`,
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json({ bets: [] });
    }

    let jsonStr = textBlock.text.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const parsed = JSON.parse(jsonStr);
    return NextResponse.json(parsed);
  } catch (err) {
    console.error("Parse text error:", err);
    return NextResponse.json(
      { error: "Failed to parse bet text", bets: [] },
      { status: 500 }
    );
  }
}
