import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { promos, weekName } = await req.json();

  if (!promos || !Array.isArray(promos) || promos.length === 0) {
    return NextResponse.json(
      { error: "No promos provided" },
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
    // Build promo details for the prompt
    const promoDetails = promos
      .map(
        (p: {
          name: string;
          ruleJson: {
            percentBack: number;
            minHandleUnits: number;
            capUnits: number;
            oddsMin?: number | null;
            sport?: string | null;
            betType?: string | null;
            disqualifyBothSides?: boolean;
            windowStart?: string;
            windowEnd?: string;
          };
        }) => {
          const r = p.ruleJson;
          return `- ${p.name}: ${r.percentBack}% back on NET losses, sport=${r.sport}, betType=${r.betType}, min handle=${r.minHandleUnits} units, cap=${r.capUnits} units FP, odds min=${r.oddsMin ?? "none"}, both-sides DQ=${r.disqualifyBothSides ? "yes" : "no"}, window=${r.windowStart} to ${r.windowEnd}`;
        }
      )
      .join("\n");

    const response = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: `You are writing a text message to send to a private betting pool group chat announcing this week's promos. Keep it casual, clear, and exciting but professional. The members need to understand exactly how each promo works.

Week: ${weekName || "This Week"}

Promos:
${promoDetails}

Write a group text message that:
1. Opens with a brief exciting intro (1 line)
2. Lists each promo with clear, simple rules:
   - What sport/bet type it covers
   - How much they need to bet to qualify (minimum handle)
   - What % back they get on NET LOSSES (emphasize NET — wins offset losses)
   - Max FP they can earn (cap)
   - Minimum odds requirement if applicable
   - Window dates (format nicely, e.g. "Mon 2/24 - Sun 3/2")
3. Add a brief "Rules that apply to ALL promos" section:
   - Rebate is on NET losses (wins subtract from losses). If you're net positive on eligible bets, you get $0 back.
   - Betting both sides of the same game = FULL disqualification from that entire promo
   - Free play bets don't count toward handle or losses
   - Only straight bets count (no parlays, live bets, or props unless specifically noted)
4. End with a brief hype line

Use plain text formatting (no markdown). Use line breaks and dashes for readability. Keep it concise — this is a text message, not an essay. Use units (not dollars) since this is a unit-based pool.

Respond with ONLY the text message, nothing else.`,
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json({ error: "No text generated" }, { status: 500 });
    }

    return NextResponse.json({ text: textBlock.text.trim() });
  } catch (err) {
    console.error("Generate promo text error:", err);
    return NextResponse.json(
      { error: "Failed to generate text" },
      { status: 500 }
    );
  }
}
