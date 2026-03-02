import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const eventId = searchParams.get("eventId");
  const status = searchParams.get("status");
  const sport = searchParams.get("sport");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {
    operatorId: session.operatorId,
  };
  if (eventId) where.eventId = eventId;
  if (status) where.status = status;
  if (sport) where.sportKey = sport;

  const picks = await prisma.trackedPick.findMany({
    where,
    orderBy: { trackedAt: "desc" },
  });

  return NextResponse.json({ picks });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const data = await req.json();

  // Duplicate check
  const existing = await prisma.trackedPick.findFirst({
    where: {
      operatorId: session.operatorId,
      eventId: data.eventId,
      market: data.market,
      pick: data.pick,
    },
  });
  if (existing) {
    return NextResponse.json(
      { error: "Pick already tracked", id: existing.id },
      { status: 409 }
    );
  }

  const pick = await prisma.trackedPick.create({
    data: {
      operatorId: session.operatorId,
      groupId: session.groupId,
      eventId: data.eventId,
      sportKey: data.sportKey,
      sportDisplay: data.sportDisplay,
      homeTeam: data.homeTeam,
      awayTeam: data.awayTeam,
      commenceTime: new Date(data.commenceTime),
      category: data.category,
      market: data.market,
      marketLabel: data.marketLabel,
      pick: data.pick,
      reasoning: data.reasoning,
      confidence: data.confidence,
      bestBook: data.bestBook,
      bestBookName: data.bestBookName,
      bestOdds: data.bestOdds,
      pinnacleOdds: data.pinnacleOdds ?? null,
      evPercent: data.evPercent ?? null,
      stakeAmount: data.stakeAmount ?? null,
      status: "PENDING",
    },
  });

  return NextResponse.json({ id: pick.id });
}
