import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { CopySummary } from "./copy-summary";

export default async function ResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const week = await prisma.week.findUnique({
    where: { id },
    include: {
      weekStatements: {
        include: { member: true },
        orderBy: { weeklyScoreUnits: "desc" },
      },
    },
  });

  if (!week || week.status !== "CLOSED") notFound();

  const statements = week.weekStatements;

  const summaryText = `🏆 ${week.name} Results\n${statements
    .map(
      (s, i) =>
        `${i + 1}. ${s.member.name}: ${s.weeklyScoreUnits >= 0 ? "+" : ""}${
          s.weeklyScoreUnits
        } units`
    )
    .join("\n")}\n\nSettlements:\n${statements
    .filter((s) => s.owesHouseUnits > 0)
    .map((s) => `${s.member.name} owes house: ${s.owesHouseUnits} units`)
    .join("\n")}${
    statements.filter((s) => s.houseOwesUnits > 0).length > 0
      ? "\n" +
        statements
          .filter((s) => s.houseOwesUnits > 0)
          .map(
            (s) =>
              `House owes ${s.member.name}: ${s.houseOwesUnits} units${
                s.houseOwesFreePlayUnits > 0
                  ? ` + ${s.houseOwesFreePlayUnits} free play`
                  : ""
              }`
          )
          .join("\n")
      : ""
  }`;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/weeks/${id}`}
          className="text-gray-500 text-xs hover:text-gray-300"
        >
          ← {week.name}
        </Link>
        <h2 className="text-2xl font-bold text-white">Results</h2>
        <p className="text-gray-500 text-xs">
          Closed {week.closedAt ? new Date(week.closedAt).toLocaleString() : ""}
        </p>
      </div>

      {/* Leaderboard */}
      <div className="space-y-2">
        {statements.map((s, i) => (
          <div
            key={s.id}
            className="bg-gray-900 rounded-xl border border-gray-800 p-4 flex items-center gap-4"
          >
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                i === 0
                  ? "bg-yellow-500/20 text-yellow-400"
                  : i === 1
                  ? "bg-gray-400/20 text-gray-300"
                  : i === 2
                  ? "bg-orange-500/20 text-orange-400"
                  : "bg-gray-800 text-gray-500"
              }`}
            >
              {i + 1}
            </div>
            <div className="flex-1">
              <p className="text-white font-medium">{s.member.name}</p>
              <div className="flex items-center gap-3 mt-0.5">
                <span className="text-xs text-gray-500">
                  Cash: {s.cashProfitUnits >= 0 ? "+" : ""}
                  {s.cashProfitUnits}
                </span>
                {s.freePlayEarnedUnits > 0 && (
                  <span className="text-xs text-blue-400">
                    FP: +{s.freePlayEarnedUnits}
                  </span>
                )}
              </div>
            </div>
            <span
              className={`text-lg font-bold ${
                s.weeklyScoreUnits > 0
                  ? "text-green-400"
                  : s.weeklyScoreUnits < 0
                  ? "text-red-400"
                  : "text-gray-400"
              }`}
            >
              {s.weeklyScoreUnits >= 0 ? "+" : ""}
              {s.weeklyScoreUnits}
            </span>
          </div>
        ))}
      </div>

      {/* Settlement Table */}
      <div>
        <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-3">
          Settlements
        </h3>
        <div className="bg-gray-900 rounded-xl border border-gray-800 divide-y divide-gray-800">
          {statements
            .filter((s) => s.owesHouseUnits > 0)
            .map((s) => (
              <div key={s.id} className="p-3 flex items-center justify-between">
                <span className="text-white text-sm">{s.member.name}</span>
                <span className="text-red-400 text-sm font-medium">
                  Owes {s.owesHouseUnits} units
                </span>
              </div>
            ))}
          {statements
            .filter((s) => s.houseOwesUnits > 0)
            .map((s) => (
              <div key={s.id} className="p-3 flex items-center justify-between">
                <span className="text-white text-sm">{s.member.name}</span>
                <span className="text-green-400 text-sm font-medium">
                  Owed {s.houseOwesUnits} units
                  {s.houseOwesFreePlayUnits > 0 &&
                    ` + ${s.houseOwesFreePlayUnits} FP`}
                </span>
              </div>
            ))}
          {statements.filter(
            (s) => s.owesHouseUnits > 0 || s.houseOwesUnits > 0
          ).length === 0 && (
            <div className="p-3 text-center text-gray-500 text-sm">
              All even — no settlements needed
            </div>
          )}
        </div>
      </div>

      <CopySummary text={summaryText} />
    </div>
  );
}
