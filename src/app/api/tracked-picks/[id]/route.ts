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

  // If just updating stake amount (no result)
  if (body.stakeAmount !== undefined) {
    await prisma.trackedPick.update({
      where: { id },
      data: {
        stakeAmount: body.stakeAmount,
      },
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
