import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

// Allow up to 60s for large text inputs with many bets
export const maxDuration = 60;

/** Robustly extract {"bets": [...]} from AI response, handling:
 *  - markdown code blocks
 *  - extra text before/after JSON
 *  - truncated JSON arrays (closes them gracefully)
 */
function extractBetsJson(raw: string): { bets: unknown[] } {
  let str = raw.trim();

  // Strip markdown code fences
  if (str.startsWith("```")) {
    str = str.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  // Try direct parse first
  try {
    const parsed = JSON.parse(str);
    if (parsed && Array.isArray(parsed.bets)) return parsed;
  } catch { /* fall through */ }

  // Find the JSON object starting with {"bets"
  const start = str.indexOf('{"bets"');
  if (start === -1) return { bets: [] };

  let jsonStr = str.slice(start);

  // Try parsing as-is
  try {
    const parsed = JSON.parse(jsonStr);
    if (parsed && Array.isArray(parsed.bets)) return parsed;
  } catch { /* fall through — likely truncated */ }

  // Handle truncated JSON — find the last complete object in the array
  // by looking for the last "}," or "}" before the truncation
  const lastCompleteObj = jsonStr.lastIndexOf("}");
  if (lastCompleteObj > 0) {
    // Try closing the array and outer object
    const trimmed = jsonStr.slice(0, lastCompleteObj + 1) + "]}";
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && Array.isArray(parsed.bets)) return parsed;
    } catch { /* fall through */ }

    // Maybe there's a trailing comma before we need to close
    const withoutTrailingComma = jsonStr.slice(0, lastCompleteObj + 1).replace(/,\s*$/, "") + "]}";
    try {
      const parsed = JSON.parse(withoutTrailingComma);
      if (parsed && Array.isArray(parsed.bets)) return parsed;
    } catch { /* fall through */ }
  }

  return { bets: [] };
}

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
      max_tokens: 8192,
      messages: [
        {
          role: "user",
          content: `Analyze this pasted text from a betting app or sportsbook. It contains bet history or active bets. Extract ALL individual bets shown. The text may include sports bets AND casino bets.

For each bet, provide:
- description: The bet description (e.g. "Chiefs -3.5", "Lakers ML", "Over 45.5", "Blackjack Hand #123", "Roulette - Red", "Casino Session")
- oddsAmerican: The American odds as a number. If decimal odds are shown, convert to American. For casino bets without clear odds, use -100 as default.
- stake: The wager/stake amount as a number (units, not dollars). This is the actual amount wagered. If not visible, use 0.
- isFreePlay: If the wager amount shown is $0.00 or "Free Bet" or "Free Play" or "Bonus Bet", set this to true. A $0 wager means it was placed using free play credits — in that case, look for the "To Win" or potential payout amount and use that as the stake instead. Otherwise false.

IMPORTANT: If you see "Agent Payment" as the payment or funding source for a bet, SKIP that bet entirely — do NOT include it in the output. Agent Payment bets are free play credits given by the operator and should not be tracked as new bets.
- eventKey: A short identifier for the game/event. MUST start with the sport/league prefix, then the event. Examples: "nfl-chiefs-bills-feb17", "nba-lakers-celtics-feb17", "golf-pga-genesis-invitational", "mlb-yankees-redsox-mar15", "nhl-bruins-rangers-feb17", "soccer-epl-liverpool-chelsea", "tennis-aus-open-djokovic-sinner", "ufc-306-main-event", "casino-blackjack", "casino-roulette". Always use lowercase with hyphens.
- sport: The sport or league category as a lowercase string. Examples: "golf", "nfl", "nba", "mlb", "nhl", "soccer", "tennis", "ufc", "mma", "boxing", "cricket", "f1", "nascar", "pga", "lpga", "college-football", "college-basketball", "esports", "casino". Pick the most specific appropriate category.
- betType: The type of bet as a lowercase string. Examples: "outright" (tournament/futures winner), "matchup" (head-to-head matchup or tournament matchup), "round-leader" (1st/2nd/3rd round leader), "top-finish" (top 5/10/20 finish), "spread" (point spread/handicap), "moneyline" (straight win/ML), "total" (over/under), "prop" (player prop, team prop), "futures" (season futures like MVP, championship), "parlay" (multi-leg parlay), "live" (live/in-play bet), "3-ball" (3-ball matchup in golf), "session" (casino session), "other" (anything else). Pick the most specific type that applies.
- placedAt: The exact date/time the bet was placed if visible (e.g. "2/17/2026 3:45:12 PM"). Include seconds if shown. If not visible, use null.

SETTLED/RESULT DETECTION:
- settled: ONLY mark a bet as settled if there is an explicit "Result" or "Status" column/field and it clearly says "Win", "Won", "Lose", "Lost", "Loss", or "Push" next to that specific bet. If the Result column is blank/empty next to a bet, or there is no Result column visible, that bet is still OPEN — set settled to null.
- CRITICAL: Do NOT guess settlement status. ONLY read the explicit text in the Result/Status column. When in doubt, default to null (open).
- Casino bets (sport="casino") are ALWAYS settled since they are past events — always set settled to "WIN" or "LOSS" based on the profit/loss shown.
- profitAmount: For settled bets only, the net profit or loss as a number. Positive for wins (e.g. 150), negative for losses (e.g. -200). For open bets, set to null.

CASINO PROFIT/LOSS ENTRIES:
If you see a casino entry that just shows a profit or loss amount (e.g. "Casino +150", "Casino -200", "Table Games +75", "Slots -50") WITHOUT a specific wager amount:
- Treat it as a settled bet
- description: Use what's shown (e.g. "Casino +150", "Slots -50")
- For WINS (positive amount like +150): set stake to the profit amount (e.g. 150), oddsAmerican to 100 (even money), settled to "WIN", profitAmount to the positive amount (e.g. 150)
- For LOSSES (negative amount like -200): set stake to the absolute loss amount (e.g. 200), oddsAmerican to -100, settled to "LOSS", profitAmount to the negative amount (e.g. -200)

If a parlay/multi-leg bet is shown, extract it as a single bet with the combined description listing all legs.

Respond ONLY with valid JSON in this exact format, no other text:
{
  "bets": [
    {
      "description": "string",
      "oddsAmerican": number,
      "stake": number,
      "isFreePlay": boolean,
      "eventKey": "string",
      "sport": "string",
      "betType": "string",
      "placedAt": "string or null",
      "settled": "WIN or LOSS or PUSH or null",
      "profitAmount": "number or null"
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

    const parsed = extractBetsJson(textBlock.text);
    return NextResponse.json(parsed);
  } catch (err) {
    console.error("Parse text error:", err);
    return NextResponse.json(
      { error: "Failed to parse bet text", bets: [] },
      { status: 500 }
    );
  }
}
