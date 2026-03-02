import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const data = await req.json();

  const { pick, bestOdds, stakeAmount, bestBookName, bookState } = data;

  if (!pick || typeof pick !== "string" || !pick.trim()) {
    return NextResponse.json(
      { error: "Pick description is required" },
      { status: 400 }
    );
  }

  if (!bestOdds || typeof bestOdds !== "number") {
    return NextResponse.json(
      { error: "Odds are required" },
      { status: 400 }
    );
  }

  if (!bestBookName || typeof bestBookName !== "string" || !bestBookName.trim()) {
    return NextResponse.json(
      { error: "Sportsbook is required" },
      { status: 400 }
    );
  }

  if (!bookState || typeof bookState !== "string" || !bookState.trim()) {
    return NextResponse.json(
      { error: "State is required" },
      { status: 400 }
    );
  }

  const created = await prisma.trackedPick.create({
    data: {
      operatorId: session.operatorId,
      groupId: session.groupId,
      source: "manual",
      pick: pick.trim(),
      bestOdds: Math.round(bestOdds),
      bestBookName: bestBookName.trim(),
      bestBook: bestBookName.trim().toLowerCase().replace(/\s+/g, ""),
      bookState: bookState.trim().toUpperCase(),
      stakeAmount: stakeAmount && stakeAmount > 0 ? Math.round(stakeAmount) : null,
      status: "PENDING",
    },
  });

  return NextResponse.json({ id: created.id });
}
