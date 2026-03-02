import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { computePickStats } from "@/lib/pick-stats";
import { UserProfileClient } from "./user-profile-client";

export default async function UserProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;

  const operator = await prisma.operator.findUnique({
    where: { id },
    select: { id: true, name: true },
  });

  if (!operator) notFound();

  const picks = await prisma.trackedPick.findMany({
    where: { operatorId: id, status: { not: "VOIDED" } },
    orderBy: { trackedAt: "desc" },
  });

  const stats = computePickStats(picks);

  const serializedPicks = picks.map((p) => ({
    ...p,
    commenceTime: p.commenceTime?.toISOString() ?? null,
    settledAt: p.settledAt?.toISOString() ?? null,
    trackedAt: p.trackedAt.toISOString(),
    createdAt: p.createdAt.toISOString(),
  }));

  return (
    <UserProfileClient
      operatorName={operator.name}
      picks={serializedPicks}
      stats={stats}
      isOwn={operator.id === session.operatorId}
    />
  );
}
