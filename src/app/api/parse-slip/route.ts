import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { image, mediaType } = await req.json();

  if (!image || !mediaType) {
    return NextResponse.json(
      { error: "Missing image or mediaType" },
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
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: image,
              },
            },
            {
              type: "text",
              text: `Analyze this bet slip screenshot. Extract ALL individual bets shown. This may include sports bets AND casino bets — treat casino bets the same way. For each bet, provide:
- description: The bet description (e.g. "Chiefs -3.5", "Lakers ML", "Over 45.5", "Blackjack Hand", "Roulette - Red")
- oddsAmerican: The American odds as a number (e.g. -110, +150). If decimal or fractional odds are shown, convert to American. For casino bets without clear odds, use -110 as default.
- stake: The wager/stake amount as a number (units, not dollars). This is the actual amount wagered. If not visible, use 0.
- isFreePlay: If the wager amount shown is $0.00 or "Free Bet" or "Free Play" or "Bonus Bet", set this to true. A $0 wager means it was placed using free play credits — in that case, look for the "To Win" or potential payout amount and use that as the stake instead. Otherwise false.
- eventKey: A short identifier for the game/event (e.g. "chiefs-bills-feb17", "casino-blackjack"). Use lowercase with hyphens.
- placedAt: The exact date/time the bet was placed if visible on the slip (e.g. "2/17/2026 3:45:12 PM"). Include seconds if shown. If not visible, use null.

If this is a parlay/multi-leg bet, extract it as a single bet with the combined description listing all legs.

Respond ONLY with valid JSON in this exact format, no other text:
{
  "bets": [
    {
      "description": "string",
      "oddsAmerican": number,
      "stake": number,
      "isFreePlay": boolean,
      "eventKey": "string",
      "placedAt": "string or null"
    }
  ]
}

If you cannot identify any bets in the image, respond with: {"bets": []}`,
            },
          ],
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json({ bets: [] });
    }

    // Extract JSON from response (handle markdown code blocks)
    let jsonStr = textBlock.text.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const parsed = JSON.parse(jsonStr);
    return NextResponse.json(parsed);
  } catch (err) {
    console.error("Parse slip error:", err);
    return NextResponse.json(
      { error: "Failed to parse bet slip", bets: [] },
      { status: 500 }
    );
  }
}
