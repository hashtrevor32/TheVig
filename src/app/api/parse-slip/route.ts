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
      max_tokens: 4096,
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
              text: `Analyze this bet slip screenshot. Extract ALL individual bets shown. This may include sports bets AND casino bets.

For each bet, provide:
- description: The bet description (e.g. "Chiefs -3.5", "Lakers ML", "Over 45.5", "Blackjack Hand", "Roulette - Red", "Casino Session")
- oddsAmerican: The American odds as a number (e.g. -110, +150). If decimal or fractional odds are shown, convert to American. For casino bets without clear odds, use -100 as default.
- stake: The wager/stake amount as a number (units, not dollars). This is the actual amount wagered. If not visible, use 0.
- isFreePlay: If the wager amount shown is $0.00 or "Free Bet" or "Free Play" or "Bonus Bet", set this to true. A $0 wager means it was placed using free play credits — in that case, look for the "To Win" or potential payout amount and use that as the stake instead. Otherwise false.

IMPORTANT: If you see "Agent Payment" as the payment or funding source for a bet, SKIP that bet entirely — do NOT include it in the output. Agent Payment bets are free play credits given by the operator and should not be tracked as new bets.
- eventKey: A short identifier for the game/event. MUST start with the sport/league prefix, then the event. Examples: "nfl-chiefs-bills-feb17", "nba-lakers-celtics-feb17", "golf-pga-genesis-invitational", "mlb-yankees-redsox-mar15", "nhl-bruins-rangers-feb17", "soccer-epl-liverpool-chelsea", "tennis-aus-open-djokovic-sinner", "ufc-306-main-event", "casino-blackjack", "casino-roulette". Always use lowercase with hyphens. The sport prefix is critical for tracking promo eligibility.
- placedAt: The exact date/time the bet was placed if visible on the slip (e.g. "2/17/2026 3:45:12 PM"). Include seconds if shown. If not visible, use null.

SETTLED/RESULT DETECTION:
- settled: If the bet is visibly settled (shows "Won", "Lost", "Win", "Loss", "Push", "Settled", a green checkmark, a red X, or any other settlement indicator), set this to "WIN", "LOSS", or "PUSH". If the bet is still open/pending, set to null.
- profitAmount: For settled bets, the net profit or loss as a number. Positive for wins (e.g. 150 means they profited 150), negative for losses (e.g. -200 means they lost 200). For open bets, set to null.

CASINO PROFIT/LOSS ENTRIES:
If you see a casino entry that just shows a profit or loss amount (e.g. "Casino +150", "Casino -200", "Table Games +75", "Slots -50") WITHOUT a specific wager amount:
- Treat it as a settled bet
- description: Use what's shown (e.g. "Casino +150", "Slots -50")
- For WINS (positive amount like +150): set stake to the profit amount (e.g. 150), oddsAmerican to 100 (even money), settled to "WIN", profitAmount to the positive amount (e.g. 150)
- For LOSSES (negative amount like -200): set stake to the absolute loss amount (e.g. 200), oddsAmerican to -100, settled to "LOSS", profitAmount to the negative amount (e.g. -200)

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
      "placedAt": "string or null",
      "settled": "WIN or LOSS or PUSH or null",
      "profitAmount": "number or null"
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
