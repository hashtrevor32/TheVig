import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { BetsList } from "./bets-list";

export default async function BetsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const week = await prisma.week.findUnique({
    where: { id },
    include: {
      bets: {
        include: { member: true },
        orderBy: { placedAt: "desc" },
      },
    },
  });

  if (!week) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href={`/weeks/${id}`}
            className="text-gray-500 text-xs hover:text-gray-300"
          >
            ← {week.name}
          </Link>
          <h2 className="text-2xl font-bold text-white">Bets</h2>
        </div>
        {week.status === "OPEN" && (
          <Link
            href={`/weeks/${id}/bets/new`}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg"
          >
            Add Bet
          </Link>
        )}
      </div>

      {week.bets.length === 0 ? (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-8 text-center">
          <p className="text-gray-400">No bets yet.</p>
        </div>
      ) : (
        <BetsList bets={week.bets} weekId={id} weekStatus={week.status} />
      )}
    </div>
  );
}
