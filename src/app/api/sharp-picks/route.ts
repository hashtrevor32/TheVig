import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  fetchEventOdds,
  SPORT_MARKETS,
  SHARP_PICKS_SPORTS,
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
      ? `This is a soccer match. Think about: team form, tactical setups (do they press high or sit back?), key absences, motivation (relegation fight? title chase? dead rubber?), home/away form splits, head-to-head history, and how the game script might unfold. Soccer is low-scoring — totals markets, BTTS, and anytime goalscorer props often have edges that the market misprices because recreational bettors overweight offense. You have data for a wide range of markets including: main lines (moneyline, spread, total), game props (BTTS, draw no bet, double chance, team totals, 1st half total), and player props (anytime goalscorer, first goalscorer, player shots, shots on target, player assists, player to be booked). Use the FULL variety of markets available — don't just stick to goalscorer markets. Player shots, shots on target, and cards are where sharp edges often hide.`
      : `This is a basketball game. Think about: pace of play (fast-paced teams inflate totals and individual stats), back-to-back/rest advantages, injury impacts on usage rates and minutes distribution, home court advantage, matchup-specific factors (who guards whom?), garbage time implications for props, and how the expected game flow affects individual player outputs. Player props are where the biggest edges exist because books use algorithms that are slow to adjust for situational context.`;

    // 5. Call Claude with tool use for guaranteed structured output
    const client = new Anthropic({ apiKey: anthropicKey });

    const submitPicksTool: Anthropic.Messages.Tool = {
      name: "submit_picks",
      description:
        "Submit your sharp picks analysis for this game. Call this tool with your analysis and picks.",
      input_schema: {
        type: "object" as const,
        properties: {
          analysisNote: {
            type: "string",
            description: "2-3 sentence overview of this game and the betting landscape",
          },
          picks: {
            type: "array",
            description: "Array of 6-8 sharp picks across categories with variety",
            items: {
              type: "object",
              properties: {
                category: {
                  type: "string",
                  enum: ["main_lines", "player_props", "game_props", "longshots"],
                  description: "Pick category",
                },
                market: {
                  type: "string",
                  description:
                    "Market key from the odds data (e.g. spreads, player_points, btts)",
                },
                outcomeName: {
                  type: "string",
                  description:
                    "EXACT outcome name from the odds data. For spreads/totals: 'Over' or 'Under' or team name. For h2h: team name. For BTTS: 'Yes' or 'No'. Must match the data exactly.",
                },
                outcomeDescription: {
                  type: "string",
                  description:
                    "EXACT player name from the odds data for player prop markets (e.g. 'Jayson Tatum', 'Mohamed Salah'). Omit for non-player-prop markets.",
                },
                outcomePoint: {
                  type: "number",
                  description:
                    "EXACT point/line value from the odds data (e.g. 27.5, -3.5, 215.5). Omit for markets without points like h2h, btts, goalscorer.",
                },
                pick: {
                  type: "string",
                  description:
                    "Human-readable pick. For player props, include full player name (e.g. 'Jayson Tatum Over 27.5 Points')",
                },
                reasoning: {
                  type: "string",
                  description:
                    "2-3 sentences of matchup analysis explaining WHY this bet wins",
                },
                confidence: {
                  type: "string",
                  enum: ["high", "medium", "speculative"],
                  description: "Confidence level",
                },
              },
              required: [
                "category",
                "market",
                "outcomeName",
                "pick",
                "reasoning",
                "confidence",
              ],
            },
          },
        },
        required: ["analysisNote", "picks"],
      },
    };

    const response = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 4096,
      tools: [submitPicksTool],
      tool_choice: { type: "tool", name: "submit_picks" },
      system:
        "You are an elite sports handicapper. Analyze the game and submit your picks using the submit_picks tool.",
      messages: [
        {
          role: "user",
          content: `You are handicapping this game. Your job is to use your SPORTS KNOWLEDGE to find edges — not to scan odds tables for the best numbers. Think like a sharp bettor who watches film, studies matchups, and understands context before ever looking at a line.

The bettor has accounts at Bet365, FanDuel, and DraftKings ONLY. Pinnacle is a sharp benchmark — never recommend betting at Pinnacle.

${sportContext}

=== HOW TO HANDICAP THIS GAME ===

START with the matchup. THEN check if the odds support your thesis.

1. What is the STORYLINE of this game? Who needs a win more? What's the form, momentum, injury situation? What style of play should we expect?

2. Based on that storyline, which players are set up to have big games? Which ones are in bad spots? Think about minutes, usage, defensive matchups, motivation.

3. How should this game FLOW? Will it be high-scoring or a grind? Will one team dominate possession? Will it be close or a blowout? This shapes every bet.

4. NOW look at the odds. Do the books agree with your read? Where do they disagree with each other? Where is a line soft because the public is overreacting or because books are slow to adjust?

Your reasoning must reflect MATCHUP KNOWLEDGE — mention specific teams, players, tactical situations. Do NOT just describe what the numbers say.

=== PICK CATEGORIES ===

Deliver 6-8 picks across these categories, using the variety of markets available:
- main_lines: Sides (moneyline, spread) or totals (1-2 picks)
- player_props: Player shots, shots on target, goalscorer, cards, points, rebounds, etc. The player's FULL NAME must appear in the pick (e.g. "Mohamed Salah Over 2.5 Shots on Target" or "Jayson Tatum Over 27.5 Points"). Use the exact player names from the odds data. (2-3 picks from DIFFERENT prop markets)
- game_props: BTTS, draw no bet, etc. (1-2 picks)
- longshots: 1-2 bets at +300 or longer with a real thesis — not just "this pays a lot"

=== LIVE ODDS DATA ===

Below is the current odds market for this game across sportsbooks. Use these to find the best price for your picks.

${oddsPrompt}

RULES:
- NEVER recommend any pick with odds shorter than -200. No heavy favorites — the max favorite odds allowed is -200. If the best price is -201 or worse, skip it. We want VALUE, not chalk.
- Player props MUST include the player's FULL NAME exactly as it appears in the odds data
- NEVER pick contradictory bets (both sides of the same market)
- Each pick must be a DIFFERENT angle — build a coherent game thesis
- ONLY recommend bets available at bet365, fanduel, or draftkings
- At least 1 main line, at least 2 player props from different markets (if prop data exists), at least 1 game prop, at least 1 longshot
- If a market has no data, skip it — do not fabricate odds, players, or outcomes

CRITICAL — OUTCOME IDENTIFIERS:
- outcomeName MUST be the EXACT string from the data (e.g. "Over", "Under", "Yes", "No", or a team name like "Boston Celtics")
- outcomeDescription MUST be the EXACT player name string for player prop markets (e.g. "Jayson Tatum" not "J. Tatum"). Omit this field entirely for non-player-prop markets.
- outcomePoint MUST be the EXACT numerical line from the data (e.g. 27.5, not 28). Omit this field for markets without points (h2h, btts, goalscorer).
- We use these identifiers to look up the ACTUAL best odds — so they must match the data exactly.`,
        },
      ],
    });

    // 6. Extract structured data from tool use response — no JSON parsing needed
    const toolUseBlock = response.content.find(
      (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use"
    );

    if (!toolUseBlock) {
      console.error(
        "Sharp picks: No tool_use block in response. Stop reason:",
        response.stop_reason
      );
      return NextResponse.json(
        { error: "AI analysis returned no results. Try again." },
        { status: 500 }
      );
    }

    const parsed = toolUseBlock.input as {
      analysisNote: string;
      picks: Array<{
        category: SharpPickCategory;
        market: string;
        outcomeName: string;
        outcomeDescription?: string;
        outcomePoint?: number;
        pick: string;
        reasoning: string;
        confidence: "high" | "medium" | "speculative";
      }>;
    };

    // 7. Enrich picks — deterministic matching using structured identifiers,
    //    ALWAYS use actual odds from data, never trust Claude's numbers
    const fmtOdds = (odds: number) => (odds > 0 ? `+${odds}` : `${odds}`);

    const enrichedPicks: SharpPick[] = (parsed.picks || []).map((pick) => {
      let deepLink: string | undefined;
      let pinnacleOdds: number | undefined;
      let bestBook = "draftkings"; // fallback
      let bestOdds = 0;

      const marketAnalysis = analyses.find((a) => a.marketKey === pick.market);
      if (marketAnalysis) {
        // Deterministic match: use the structured identifiers Claude returned
        const matched = marketAnalysis.outcomes.find((o) => {
          // Name must match (e.g., "Over", "Under", "Yes", team name)
          if (o.name.toLowerCase() !== pick.outcomeName.toLowerCase()) return false;

          // For player props, description (player name) must match
          if (pick.outcomeDescription) {
            if (!o.description) return false;
            if (o.description.toLowerCase() !== pick.outcomeDescription.toLowerCase()) return false;
          }

          // For lines with points, point must match
          if (pick.outcomePoint !== undefined) {
            if (o.point === undefined) return false;
            if (o.point !== pick.outcomePoint) return false;
          }

          return true;
        });

        if (matched) {
          pinnacleOdds = matched.pinnacleOdds;
          // ALWAYS use the pre-computed best price from actual data
          if (matched.bestUserBook) {
            bestBook = matched.bestUserBook.bookKey;
            bestOdds = matched.bestUserBook.odds;
            deepLink = matched.bestUserBook.link;
          }
        } else {
          // Fallback: fuzzy match by pick text (handles edge cases where identifiers are slightly off)
          const pickLower = pick.pick.toLowerCase();
          for (const outcome of marketAnalysis.outcomes) {
            const labelLower = outcome.label.toLowerCase();
            if (pickLower.includes(labelLower) || labelLower.includes(pickLower)) {
              pinnacleOdds = outcome.pinnacleOdds;
              if (outcome.bestUserBook) {
                bestBook = outcome.bestUserBook.bookKey;
                bestOdds = outcome.bestUserBook.odds;
                deepLink = outcome.bestUserBook.link;
              }
              break;
            }
          }
        }
      }

      return {
        category: pick.category,
        market: pick.market,
        marketLabel: MARKET_LABELS[pick.market] || pick.market,
        pick: pick.pick,
        reasoning: pick.reasoning,
        confidence: pick.confidence,
        bestBook,
        bestBookName: BOOK_DISPLAY_NAMES[bestBook] || bestBook,
        bestOdds,
        bestOddsFormatted: bestOdds !== 0 ? fmtOdds(bestOdds) : "N/A",
        deepLink,
        pinnacleOdds,
        evPercent: undefined,
      } satisfies SharpPick;
    })

    // Filter out any picks where we couldn't find actual odds
    .filter((p) => p.bestOdds !== 0);

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
