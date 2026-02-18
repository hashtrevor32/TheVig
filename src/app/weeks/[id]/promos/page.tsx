import { prisma } from "@/lib/prisma";
import { requireWeekAccess } from "@/lib/auth";
import Link from "next/link";
import { PromoListClient } from "./promo-list-client";

export default async function PromosPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireWeekAccess(id);

  const week = await prisma.week.findUnique({
    where: { id },
    include: {
      promos: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!week) return null;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/weeks/${id}`}
          className="text-gray-500 text-xs hover:text-gray-300"
        >
          &larr; {week.name}
        </Link>
        <h2 className="text-2xl font-bold text-white">Promos</h2>
      </div>

      {week.status === "OPEN" && (
        <div className="grid grid-cols-2 gap-3">
          <Link
            href={`/weeks/${id}/promos/new`}
            className="py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg text-center transition-colors text-sm"
          >
            Create Promo
          </Link>
          <Link
            href={`/weeks/${id}/promos/new?suggest=true`}
            className="py-3 bg-gradient-to-r from-purple-600/20 to-blue-600/20 hover:from-purple-600/30 hover:to-blue-600/30 text-purple-400 font-medium rounded-lg text-center transition-colors text-sm border border-purple-500/20"
          >
            Suggest Promos
          </Link>
        </div>
      )}

      {week.promos.length === 0 ? (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 text-center">
          <p className="text-gray-500">No promos yet</p>
          <p className="text-gray-600 text-xs mt-1">
            Create a promo to auto-award free play based on betting activity
          </p>
        </div>
      ) : (
        <PromoListClient promos={week.promos} weekId={id} weekStatus={week.status} />
      )}
    </div>
  );
}
