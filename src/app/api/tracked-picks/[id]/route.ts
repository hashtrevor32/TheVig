import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();

  const pick = await prisma.trackedPick.findUnique({ where: { id } });
  if (!pick || pick.operatorId !== session.operatorId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // If settling (result provided)
  if (body.result) {
    if (!["WIN", "LOSS", "PUSH"].includes(body.result)) {
      return NextResponse.json(
        { error: "Invalid result. Must be WIN, LOSS, or PUSH." },
        { status: 400 }
      );
    }

    if (pick.status !== "PENDING") {
      return NextResponse.json(
        { error: "Pick already settled" },
        { status: 400 }
      );
    }

    await prisma.trackedPick.update({
      where: { id },
      data: {
        status: "SETTLED",
        result: body.result,
        settledAt: new Date(),
        // Also update stake if provided alongside result
        ...(body.stakeAmount !== undefined
          ? { stakeAmount: body.stakeAmount }
          : {}),
      },
    });

    return NextResponse.json({ success: true });
  }

  // Build update object for non-settle fields
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: any = {};

  if (body.stakeAmount !== undefined) {
    updateData.stakeAmount = body.stakeAmount;
  }

  if (body.league !== undefined) {
    updateData.league = body.league || null;
    // Also set sportDisplay for cross-compat
    if (body.league) updateData.sportDisplay = body.league;
  }

  if (body.tag !== undefined) {
    updateData.tag = body.tag || null;
  }

  if (Object.keys(updateData).length > 0) {
    await prisma.trackedPick.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const pick = await prisma.trackedPick.findUnique({ where: { id } });
  if (!pick || pick.operatorId !== session.operatorId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.trackedPick.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
