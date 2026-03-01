import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  fetchEventOdds,
  SPORT_MARKETS,
  SHARP_PICKS_SPORTS,
  SHARP_PICKS_BOOKS,
  BOOK_DISPLAY_NAMES,
  getCreditStats,
  sportDisplayName,
} from "@/lib/odds-api";
import {
  analyzeEventOdds,
  formatAnalysisForPrompt,
  MARKET_LABELS,
  type SharpPick,
  type SharpPicksResponse,
  type SharpPickCategory,
} from "@/lib/sharp-picks-engine";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sportKey, eventId } = await req.json();

  if (!sportKey || !eventId) {
    return NextResponse.json(
      { error: "Missing sportKey or eventId" },
      { status: 400 }
    );
  }

  if (!SHARP_PICKS_SPORTS.has(sportKey)) {
    return NextResponse.json(
      { error: "Sharp picks not available for this sport" },
      { status: 400 }
    );
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 500 }
    );
  }

  try {
    // 1. Fetch comprehensive odds for this event
    const markets = SPORT_MARKETS[sportKey];
    const eventData = await fetchEventOdds(sportKey, eventId, markets);

    if (!eventData) {
      return NextResponse.json(
        { error: "Event not found or no longer available" },
        { status: 404 }
      );
    }

    // 2. Run pre-analysis
    const analyses = analyzeEventOdds(eventData);

    if (analyses.length === 0) {
      return NextResponse.json(
        { error: "No odds data available for analysis" },
        { status: 404 }
      );
    }

    // 3. Format for Claude
    const oddsPrompt = formatAnalysisForPrompt(eventData, analyses);

    // 4. Sport-specific context
    const isSoccer = sportKey.startsWith("soccer_");

    const sportContext = isSoccer
      ? `This is a soccer match. Think about: team form, tactical setups (do they press high or sit back?), key absences, motivation (relegation fight? title chase? dead rubber?), home/away form splits, head-to-head history, and how the game script might unfold. Soccer is low-scoring — totals markets, BTTS, and anytime goalscorer props often have edges that the market misprices because recreational bettors overweight offense.`
      : `This is a basketball game. Think about: pace of play (fast-paced teams inflate totals and individual stats), back-to-back/rest advantages, injury impacts on usage rates and minutes distribution, home court advantage, matchup-specific factors (who guards whom?), garbage time implications for props, and how the expected game flow affects individual player outputs. Player props are where the biggest edges exist because books use algorithms that are slow to adjust for situational context.`;

    // 5. Call Claude
    const client = new Anthropic({ apiKey: anthropicKey });

    const response = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 8192,
      system: "You are an elite sports handicapper. You MUST respond with ONLY a valid JSON object — no text before or after it, no markdown code fences, no explanation. Start your response with { and end with }.",
      messages: [
        {
          role: "user",
          content: `Analyze this game like a professional bettor would: study the matchup, read the market, find angles, and deliver sharp, well-reasoned picks.

The bettor has accounts at Bet365, FanDuel, and DraftKings ONLY. Pinnacle data is provided as a sharp market benchmark — never recommend betting at Pinnacle.

${sportContext}

=== YOUR ANALYSIS APPROACH ===

For EVERY pick you make, your reasoning should read like expert analysis, not a math equation. Explain:

1. **The matchup angle** — WHY does this bet win? What's the game situation, team context, or player matchup that creates the edge? Be specific about the teams and players involved.

2. **What the market is missing** — Where is the market potentially wrong and why? Is public money inflating one side? Is a line stale because of late-breaking info? Are books slow to adjust a prop for a player whose role just changed?

3. **What the odds confirm** — Use the pre-computed data to validate your thesis. If a book is offering better odds than the sharp line suggests, that confirms your angle. If books disagree by 15+ cents, someone is wrong — explain who and why.

Do NOT just say "this has +5% EV so bet it." The EV Finder already does that. Your value is the ANALYSIS — the matchup insight, the situational edge, the reasoning a sharp bettor applies BEFORE checking the numbers.

=== PICK CATEGORIES ===

Deliver 5-8 picks across these categories:
- **main_lines**: Sides (moneyline, spread) or totals — backed by matchup analysis
- **player_props**: Individual player overs/unders — backed by usage, matchup, minutes context
- **game_props**: BTTS, draw no bet, team-specific props — backed by tactical analysis
- **longshots**: 1-2 bets at +300 or longer with a specific thesis for why the price is wrong

=== ODDS DATA (pre-analyzed with Pinnacle no-vig probabilities and EV calculations) ===

${oddsPrompt}

=== RESPONSE FORMAT ===

Respond with ONLY this JSON structure (no other text):

{
  "analysisNote": "2-3 sentence overview of this game",
  "picks": [
    {
      "category": "main_lines | player_props | game_props | longshots",
      "market": "market key from the data (e.g. spreads, player_points, btts)",
      "pick": "Human-readable pick (e.g. 'LeBron James Over 27.5 Points')",
      "reasoning": "3-5 sentences of genuine analysis.",
      "confidence": "high | medium | speculative",
      "bestBook": "bet365 | fanduel | draftkings",
      "bestOdds": -110,
      "evPercent": 5.2
    }
  ]
}

RULES:
- ONLY recommend bets available at bet365, fanduel, or draftkings — use the exact book key
- bestOdds MUST be an actual odds value from the data for that book
- Reasoning must mention the specific teams/players by name — no generic analysis
- At least 1 main line, at least 1 prop (if prop data exists), at least 1 longshot
- If a market has no data, skip it — do not fabricate odds or outcomes
- evPercent should be a number or null`,
        },
        {
          role: "assistant",
          content: "{",
        },
      ],
    });

    // 6. Parse Claude's response
    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json(
        { error: "AI analysis returned no results" },
        { status: 500 }
      );
    }

    // Check if response was truncated
    if (response.stop_reason === "max_tokens") {
      console.error("Sharp picks: Claude response truncated (hit max_tokens)");
      return NextResponse.json(
        { error: "Analysis was too long. Try again." },
        { status: 500 }
      );
    }

    // Prepend the "{" we used as assistant prefill
    let jsonStr = "{" + textBlock.text.trim();

    // Strip any trailing markdown fences or text after the JSON
    const lastBrace = jsonStr.lastIndexOf("}");
    if (lastBrace === -1) {
      console.error("Sharp picks: No closing brace found. Response:", jsonStr.substring(0, 500));
      return NextResponse.json(
        { error: "AI returned an unexpected format. Try again." },
        { status: 500 }
      );
    }
    jsonStr = jsonStr.substring(0, lastBrace + 1);

    // Fix trailing commas (common JSON generation issue)
    jsonStr = jsonStr.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");

    // Fix control characters inside strings (newlines, tabs)
    jsonStr = jsonStr.replace(/[\x00-\x1f]/g, (ch) => {
      if (ch === "\n") return "\\n";
      if (ch === "\r") return "\\r";
      if (ch === "\t") return "\\t";
      return "";
    });

    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (parseErr) {
      console.error("Sharp picks JSON parse failed:", parseErr);
      console.error("First 500 chars:", jsonStr.substring(0, 500));
      console.error("Last 200 chars:", jsonStr.substring(jsonStr.length - 200));

      // Last resort: try to extract a simpler structure
      try {
        // Sometimes Claude nests the JSON in an extra wrapper
        const innerStart = jsonStr.indexOf('{"analysisNote"');
        if (innerStart > 0) {
          const innerStr = jsonStr.substring(innerStart);
          const innerEnd = innerStr.lastIndexOf("}");
          parsed = JSON.parse(innerStr.substring(0, innerEnd + 1));
        } else {
          throw parseErr;
        }
      } catch {
        return NextResponse.json(
          { error: "AI returned malformed data. Try again." },
          { status: 500 }
        );
      }
    }

    // 7. Enrich picks with deep links from our pre-analysis data
    const enrichedPicks: SharpPick[] = (parsed.picks || []).map(
      (pick: {
        category: SharpPickCategory;
        market: string;
        pick: string;
        reasoning: string;
        confidence: "high" | "medium" | "speculative";
        bestBook: string;
        bestOdds: number;
        evPercent?: number;
      }) => {
        let deepLink: string | undefined;
        let pinnacleOdds: number | undefined;

        // Find the matching outcome to get the deep link
        const marketAnalysis = analyses.find((a) => a.marketKey === pick.market);
        if (marketAnalysis) {
          for (const outcome of marketAnalysis.outcomes) {
            const targetBook = outcome.books.find(
              (b) => b.bookKey === pick.bestBook && b.odds === pick.bestOdds
            );
            if (targetBook) {
              deepLink = targetBook.link;
              pinnacleOdds = outcome.pinnacleOdds;
              break;
            }
          }
        }

        const fmtOdds = (odds: number) => (odds > 0 ? `+${odds}` : `${odds}`);

        return {
          category: pick.category,
          market: pick.market,
          marketLabel: MARKET_LABELS[pick.market] || pick.market,
          pick: pick.pick,
          reasoning: pick.reasoning,
          confidence: pick.confidence,
          bestBook: pick.bestBook,
          bestBookName: BOOK_DISPLAY_NAMES[pick.bestBook] || pick.bestBook,
          bestOdds: pick.bestOdds,
          bestOddsFormatted: fmtOdds(pick.bestOdds),
          deepLink,
          pinnacleOdds,
          evPercent: pick.evPercent ?? undefined,
        } satisfies SharpPick;
      }
    );

    const result: SharpPicksResponse = {
      eventId,
      homeTeam: eventData.home_team,
      awayTeam: eventData.away_team,
      sportKey: eventData.sport_key,
      sportDisplay: sportDisplayName(eventData.sport_key),
      commenceTime: eventData.commence_time,
      picks: enrichedPicks,
      analysisNote: parsed.analysisNote || "",
      generatedAt: new Date().toISOString(),
    };

    return NextResponse.json({
      ...result,
      credits: getCreditStats(),
    });
  } catch (err) {
    console.error("Sharp picks error:", err);

    const message = err instanceof Error ? err.message : "Failed to generate sharp picks";
    const isOverloaded = message.includes("overloaded") || message.includes("529");
    const isJsonParse = message.includes("JSON") || message.includes("Unexpected token");

    const userMessage = isOverloaded
      ? "AI service temporarily overloaded. Try again in a moment."
      : isJsonParse
        ? "AI returned an unexpected format. Try again."
        : message;

    return NextResponse.json({ error: userMessage }, { status: 500 });
  }
}
