import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { computePickStats } from "@/lib/pick-stats";
import { TrackedPicksClient } from "./tracked-picks-client";

export default async function SharpPicksPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const picks = await prisma.trackedPick.findMany({
    where: { operatorId: session.operatorId },
    orderBy: { trackedAt: "desc" },
  });

  const stats = computePickStats(picks);

  // Serialize dates for the client component
  const active = picks.filter((p) => p.status !== "VOIDED");
  const serializedPicks = active.map((p) => ({
    ...p,
    commenceTime: p.commenceTime?.toISOString() ?? null,
    settledAt: p.settledAt?.toISOString() ?? null,
    trackedAt: p.trackedAt.toISOString(),
    createdAt: p.createdAt.toISOString(),
  }));

  return <TrackedPicksClient picks={serializedPicks} stats={stats} />;
}
