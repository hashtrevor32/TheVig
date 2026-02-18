import { prisma } from "@/lib/prisma";
import { requireWeekAccess } from "@/lib/auth";
import Link from "next/link";
import { CloseWeekButton } from "./close-week-button";
import { computePromoResults, type LossRebateRule } from "@/lib/promo-engine";

export default async function CloseWeekPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireWeekAccess(id);

  const week = await prisma.week.findUnique({
    where: { id },
    include: {
      bets: { include: { member: true } },
    },
  });

  if (!week) return null;

  if (week.status === "CLOSED") {
    return (
      <div className="space-y-6">
        <div>
          <Link
            href={`/weeks/${id}`}
            className="text-gray-500 text-xs hover:text-gray-300"
          >
            ← {week.name}
          </Link>
          <h2 className="text-2xl font-bold text-white">Week Closed</h2>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-8 text-center">
          <p className="text-gray-400">This week is already closed.</p>
          <Link
            href={`/weeks/${id}/results`}
            className="inline-block mt-4 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm"
          >
            View Results
          </Link>
        </div>
      </div>
    );
  }

  const totalBets = week.bets.length;
  const openBets = week.bets.filter((b) => b.status === "OPEN");
  const settledBets = week.bets.filter((b) => b.status === "SETTLED");
  const canClose = openBets.length === 0 && totalBets > 0;

  // Fetch promo preview when ready to close
  const promos = await prisma.promo.findMany({
    where: { weekId: id, active: true },
  });

  const promoResults = await Promise.all(
    promos.map(async (p) => ({
      promo: p,
      rule: p.ruleJson as unknown as LossRebateRule,
      results: await computePromoResults(p.id),
    }))
  );

  const totalPromoAwards = promoResults.reduce(
    (sum, pr) =>
      sum + pr.results.reduce((s, r) => s + r.projectedAward, 0),
    0
  );

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/weeks/${id}`}
          className="text-gray-500 text-xs hover:text-gray-300"
        >
          &larr; {week.name}
        </Link>
        <h2 className="text-2xl font-bold text-white">Close Week</h2>
      </div>

      {/* Checklist */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-gray-300 text-sm">Total bets</span>
          <span className="text-white font-medium">{totalBets}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-300 text-sm">Settled bets</span>
          <span className="text-green-400 font-medium">
            {settledBets.length}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-300 text-sm">Open bets remaining</span>
          <span
            className={`font-medium ${
              openBets.length === 0 ? "text-green-400" : "text-red-400"
            }`}
          >
            {openBets.length}
          </span>
        </div>
      </div>

      {/* Open bets that need settling */}
      {openBets.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-red-400 uppercase tracking-wide mb-3">
            Needs Settlement
          </h3>
          <div className="space-y-2">
            {openBets.map((bet) => (
              <Link
                key={bet.id}
                href={`/weeks/${id}/bets/${bet.id}/settle`}
                className="block bg-gray-900 rounded-lg border border-gray-800 p-3 hover:border-gray-600 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white text-sm">{bet.description}</p>
                    <p className="text-gray-500 text-xs">
                      {bet.member.name} &middot; {bet.stakeCashUnits} units
                    </p>
                  </div>
                  <span className="text-blue-400 text-xs">Settle &rarr;</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Promo Award Preview */}
      {promoResults.length > 0 && canClose && (
        <div>
          <h3 className="text-sm font-medium text-blue-400 uppercase tracking-wide mb-3">
            Promo Awards Preview
          </h3>
          <div className="space-y-3">
            {promoResults.map((pr) => {
              const qualifiedMembers = pr.results.filter((r) => r.qualified);
              return (
                <div
                  key={pr.promo.id}
                  className="bg-gray-900 rounded-xl border border-gray-800 p-4 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-white font-medium text-sm">
                      {pr.promo.name}
                    </p>
                    <span className="text-blue-400 text-xs font-medium">
                      {qualifiedMembers.length} qualified
                    </span>
                  </div>
                  {qualifiedMembers.length > 0 ? (
                    <div className="space-y-1">
                      {qualifiedMembers.map((r) => (
                        <div
                          key={r.memberId}
                          className="flex items-center justify-between text-sm"
                        >
                          <span className="text-gray-300">{r.memberName}</span>
                          <span className="text-blue-400 font-medium">
                            +{r.projectedAward} FP
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-xs">
                      No members qualified
                    </p>
                  )}
                </div>
              );
            })}

            {totalPromoAwards > 0 && (
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 text-center">
                <p className="text-blue-400 text-sm font-medium">
                  Total promo free play: {totalPromoAwards} units
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Default 30% Loss Rebate Preview */}
      {canClose && (() => {
        // Compute per-member cash P/L for default rebate preview
        const memberPL = new Map<string, { name: string; cashLoss: number; promoFP: number }>();
        for (const bet of settledBets) {
          const pl = (bet.payoutCashUnits ?? 0) - bet.stakeCashUnits;
          const existing = memberPL.get(bet.memberId);
          if (existing) {
            existing.cashLoss += pl;
          } else {
            memberPL.set(bet.memberId, { name: bet.member.name, cashLoss: pl, promoFP: 0 });
          }
        }
        // Add promo FP totals per member
        for (const pr of promoResults) {
          for (const r of pr.results) {
            if (r.qualified && r.projectedAward > 0) {
              const entry = memberPL.get(r.memberId);
              if (entry) entry.promoFP += r.projectedAward;
            }
          }
        }
        const rebateEntries = [...memberPL.entries()]
          .filter(([, v]) => v.cashLoss < 0)
          .map(([memberId, v]) => {
            const loss = Math.abs(v.cashLoss);
            const defaultRebate = Math.floor(loss * 0.3);
            const topUp = Math.max(0, defaultRebate - v.promoFP);
            return { memberId, name: v.name, loss, defaultRebate, promoFP: v.promoFP, topUp };
          })
          .filter((e) => e.topUp > 0);

        if (rebateEntries.length === 0) return null;

        const totalTopUp = rebateEntries.reduce((s, e) => s + e.topUp, 0);

        return (
          <div>
            <h3 className="text-sm font-medium text-green-400 uppercase tracking-wide mb-3">
              Default 30% Loss Rebate
            </h3>
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 space-y-2">
              {rebateEntries.map((e) => (
                <div key={e.memberId} className="flex items-center justify-between text-sm">
                  <div>
                    <span className="text-gray-300">{e.name}</span>
                    <span className="text-gray-600 text-xs ml-2">
                      {e.loss} loss &times; 30% = {e.defaultRebate}
                      {e.promoFP > 0 ? ` (promo: ${e.promoFP}, top-up: ${e.topUp})` : ""}
                    </span>
                  </div>
                  <span className="text-green-400 font-medium">+{e.topUp} FP</span>
                </div>
              ))}
              <div className="border-t border-gray-800 pt-2 mt-2 text-center">
                <span className="text-green-400 text-sm font-medium">
                  Total rebate top-up: {totalTopUp} FP
                </span>
              </div>
            </div>
          </div>
        );
      })()}

      <CloseWeekButton weekId={id} canClose={canClose} />
    </div>
  );
}
