"use client";

import { useState } from "react";
import { Copy, Check, ChevronDown, ChevronUp } from "lucide-react";
import Link from "next/link";

type MemberReport = {
  name: string;
  cashPL: number;
  freePlayEarned: number;
  weeklyScore: number;
  owesHouse: number;
  houseOwes: number;
  freePlayOwed: number;
  totalBets: number;
  wins: number;
  losses: number;
};

type ReportData = {
  weekId: string;
  weekName: string;
  closedAt: string;
  members: MemberReport[];
};

export function WeeklyReport({ report }: { report: ReportData }) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const totalCashFlow =
    report.members.reduce((s, m) => s + m.owesHouse, 0) -
    report.members.reduce((s, m) => s + m.houseOwes, 0);
  const totalFPOwed = report.members.reduce((s, m) => s + m.freePlayOwed, 0);

  function buildSummaryText(): string {
    const lines: string[] = [];
    lines.push(`${report.weekName} — Weekly Report`);
    lines.push("─".repeat(30));
    lines.push("");

    // Leaderboard
    report.members.forEach((m, i) => {
      const medal = i === 0 ? "1." : i === 1 ? "2." : i === 2 ? "3." : `${i + 1}.`;
      const pl = m.cashPL >= 0 ? `+${m.cashPL}` : `${m.cashPL}`;
      const fp = m.freePlayEarned > 0 ? ` (+${m.freePlayEarned} FP)` : "";
      const record = `${m.wins}W-${m.losses}L`;
      lines.push(`${medal} ${m.name}: ${pl} units${fp} [${record}]`);
    });

    lines.push("");
    lines.push("Settlements:");

    const owes = report.members.filter((m) => m.owesHouse > 0);
    const owed = report.members.filter((m) => m.houseOwes > 0);
    const fpOwed = report.members.filter((m) => m.freePlayOwed > 0);

    if (owes.length > 0) {
      owes.forEach((m) => {
        lines.push(`  ${m.name} owes: ${m.owesHouse} units`);
      });
    }
    if (owed.length > 0) {
      owed.forEach((m) => {
        lines.push(`  ${m.name} is owed: ${m.houseOwes} units`);
      });
    }
    if (fpOwed.length > 0) {
      lines.push("");
      lines.push("Free Play Owed:");
      fpOwed.forEach((m) => {
        lines.push(`  ${m.name}: ${m.freePlayOwed} FP`);
      });
    }

    return lines.join("\n");
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(buildSummaryText());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const closedDate = report.closedAt
    ? new Date(report.closedAt).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      })
    : "";

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center justify-between hover:bg-gray-800/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
            <span className="text-blue-400 text-sm font-bold">W</span>
          </div>
          <div className="text-left">
            <h3 className="text-white font-semibold text-sm">Weekly Report</h3>
            <p className="text-gray-500 text-xs">
              {report.weekName} &middot; Closed {closedDate}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {totalCashFlow > 0 && (
            <span className="text-green-400 text-xs font-medium">
              +{totalCashFlow} net
            </span>
          )}
          {expanded ? (
            <ChevronUp size={16} className="text-gray-500" />
          ) : (
            <ChevronDown size={16} className="text-gray-500" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4">
          {/* Leaderboard */}
          <div className="space-y-1.5">
            {report.members.map((m, i) => (
              <div
                key={m.name}
                className="flex items-center gap-3 py-2 px-3 rounded-lg bg-gray-800/50"
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
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
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-white text-sm font-medium truncate">
                      {m.name}
                    </span>
                    <span
                      className={`text-sm font-bold shrink-0 ml-2 ${
                        m.cashPL > 0
                          ? "text-green-400"
                          : m.cashPL < 0
                          ? "text-red-400"
                          : "text-gray-400"
                      }`}
                    >
                      {m.cashPL >= 0 ? "+" : ""}
                      {m.cashPL}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-gray-500 text-xs">
                      {m.wins}W-{m.losses}L
                      {m.totalBets > m.wins + m.losses &&
                        `-${m.totalBets - m.wins - m.losses}P`}
                    </span>
                    {m.freePlayEarned > 0 && (
                      <span className="text-blue-400 text-xs">
                        +{m.freePlayEarned} FP
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Settlements */}
          <div>
            <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
              Settlements
            </h4>
            <div className="bg-gray-800/50 rounded-lg divide-y divide-gray-700/50">
              {report.members
                .filter((m) => m.owesHouse > 0)
                .map((m) => (
                  <div
                    key={`owes-${m.name}`}
                    className="px-3 py-2.5 flex items-center justify-between"
                  >
                    <span className="text-white text-sm">{m.name}</span>
                    <span className="text-red-400 text-sm font-medium">
                      Owes {m.owesHouse} units
                    </span>
                  </div>
                ))}
              {report.members
                .filter((m) => m.houseOwes > 0)
                .map((m) => (
                  <div
                    key={`owed-${m.name}`}
                    className="px-3 py-2.5 flex items-center justify-between"
                  >
                    <span className="text-white text-sm">{m.name}</span>
                    <span className="text-green-400 text-sm font-medium">
                      Owed {m.houseOwes} units
                    </span>
                  </div>
                ))}
              {report.members.filter(
                (m) => m.owesHouse > 0 || m.houseOwes > 0
              ).length === 0 && (
                <div className="px-3 py-2.5 text-center text-gray-500 text-sm">
                  All even — no settlements
                </div>
              )}
            </div>
          </div>

          {/* Free Play Owed */}
          {totalFPOwed > 0 && (
            <div>
              <h4 className="text-xs font-medium text-blue-400 uppercase tracking-wide mb-2">
                Free Play Owed
              </h4>
              <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg divide-y divide-blue-500/10">
                {report.members
                  .filter((m) => m.freePlayOwed > 0)
                  .map((m) => (
                    <div
                      key={`fp-${m.name}`}
                      className="px-3 py-2.5 flex items-center justify-between"
                    >
                      <span className="text-white text-sm">{m.name}</span>
                      <span className="text-blue-400 text-sm font-medium">
                        {m.freePlayOwed} FP
                      </span>
                    </div>
                  ))}
                <div className="px-3 py-2 text-center">
                  <span className="text-blue-400 text-xs font-medium">
                    Total: {totalFPOwed} FP
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-2 transition-colors"
            >
              {copied ? (
                <>
                  <Check size={14} className="text-green-400" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy size={14} />
                  Copy Report
                </>
              )}
            </button>
            <Link
              href={`/weeks/${report.weekId}/results`}
              className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-2 transition-colors"
            >
              Full Results
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
