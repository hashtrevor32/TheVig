import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { computePromoResults, type LossRebateRule } from "@/lib/promo-engine";

export default async function PromoProgressPage({
  params,
}: {
  params: Promise<{ id: string; promoId: string }>;
}) {
  const { id, promoId } = await params;
  const promo = await prisma.promo.findUnique({
    where: { id: promoId },
    include: { week: true },
  });

  if (!promo || promo.weekId !== id) notFound();

  const rule = promo.ruleJson as unknown as LossRebateRule;
  const results = await computePromoResults(promoId);

  // Sort: qualified first, then by projected award desc, then by handle progress desc
  results.sort((a, b) => {
    if (a.qualified !== b.qualified) return a.qualified ? -1 : 1;
    if (a.projectedAward !== b.projectedAward) return b.projectedAward - a.projectedAward;
    return b.handleProgress - a.handleProgress;
  });

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/weeks/${id}/promos`}
          className="text-gray-500 text-xs hover:text-gray-300"
        >
          &larr; Promos
        </Link>
        <h2 className="text-2xl font-bold text-white">{promo.name}</h2>
        <p className="text-gray-500 text-xs mt-0.5">
          {rule.percentBack}% back on losses &middot; Min {rule.minHandleUnits} units
          &middot; Cap {rule.capUnits} units
        </p>
      </div>

      {/* Summary Card */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-3 text-center">
          <p className="text-gray-500 text-xs">Qualified</p>
          <p className="text-xl font-bold text-green-400">
            {results.filter((r) => r.qualified).length}
          </p>
        </div>
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-3 text-center">
          <p className="text-gray-500 text-xs">In Progress</p>
          <p className="text-xl font-bold text-yellow-400">
            {results.filter((r) => !r.qualified && !r.disqualified && r.handleProgress > 0).length}
          </p>
        </div>
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-3 text-center">
          <p className="text-gray-500 text-xs">Total Awards</p>
          <p className="text-xl font-bold text-blue-400">
            {results.reduce((s, r) => s + r.projectedAward, 0)}
          </p>
        </div>
      </div>

      {/* Member Progress Cards */}
      <div className="space-y-3">
        {results.map((r) => (
          <div
            key={r.memberId}
            className={`bg-gray-900 rounded-xl border p-4 space-y-3 ${
              r.disqualified
                ? "border-red-500/30"
                : r.qualified
                ? "border-green-500/30"
                : "border-gray-800"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-gray-700 flex items-center justify-center text-sm font-bold text-white">
                  {r.memberName[0]}
                </div>
                <div>
                  <p className="text-white font-medium">{r.memberName}</p>
                  <p className="text-gray-500 text-xs">
                    {r.eligibleBetsCount} eligible bets &middot;{" "}
                    {r.eligibleHandleUnits} units wagered
                  </p>
                </div>
              </div>
              {r.disqualified ? (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-400">
                  DQ
                </span>
              ) : r.qualified ? (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-400">
                  Qualified
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-700 text-gray-400">
                  {Math.round(r.handleProgress)}%
                </span>
              )}
            </div>

            {/* Handle Progress Bar */}
            <div>
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>
                  {r.eligibleHandleUnits} / {rule.minHandleUnits} min handle
                </span>
                {r.qualified && (
                  <span className="text-blue-400">
                    Award: {r.projectedAward} FP
                  </span>
                )}
              </div>
              <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    r.disqualified
                      ? "bg-red-500"
                      : r.qualified
                      ? "bg-green-500"
                      : "bg-yellow-500"
                  }`}
                  style={{ width: `${Math.min(r.handleProgress, 100)}%` }}
                />
              </div>
            </div>

            {/* Details */}
            {(r.qualified || r.eligibleLosingStake > 0) && (
              <div className="flex gap-4 text-xs text-gray-500">
                <span>Losing stake: {r.eligibleLosingStake} units</span>
                {r.qualified && (
                  <span className="text-blue-400">
                    {r.eligibleLosingStake} &times; {rule.percentBack}% ={" "}
                    {Math.floor((r.eligibleLosingStake * rule.percentBack) / 100)} units
                    {Math.floor((r.eligibleLosingStake * rule.percentBack) / 100) >
                    rule.capUnits
                      ? ` (capped at ${rule.capUnits})`
                      : ""}
                  </span>
                )}
              </div>
            )}

            {r.disqualified && r.disqualifyReason && (
              <p className="text-red-400 text-xs">{r.disqualifyReason}</p>
            )}
          </div>
        ))}

        {results.length === 0 && (
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 text-center">
            <p className="text-gray-500">No members in this week</p>
          </div>
        )}
      </div>
    </div>
  );
}
