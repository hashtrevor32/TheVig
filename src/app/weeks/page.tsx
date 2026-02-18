import { prisma } from "@/lib/prisma";
import { getGroupId } from "@/lib/auth";
import Link from "next/link";
import { WeekForm } from "./week-form";

export default async function WeeksPage() {
  const groupId = await getGroupId();
  const weeks = await prisma.week.findMany({
    where: { groupId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { bets: true, weekMembers: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Weeks</h2>
      </div>

      <WeekForm />

      {weeks.length === 0 ? (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-8 text-center">
          <p className="text-gray-400">No weeks yet. Create one above.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {weeks.map((w) => (
            <Link
              key={w.id}
              href={`/weeks/${w.id}`}
              className="block bg-gray-900 rounded-xl border border-gray-800 p-4 hover:border-gray-600 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-white font-semibold">{w.name}</h3>
                  <p className="text-gray-500 text-xs mt-1">
                    {new Date(w.startAt).toLocaleDateString()} –{" "}
                    {new Date(w.endAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right text-xs text-gray-500">
                    <p>{w._count.weekMembers} members</p>
                    <p>{w._count.bets} bets</p>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                      w.status === "OPEN"
                        ? "bg-green-500/10 text-green-400"
                        : "bg-gray-700 text-gray-400"
                    }`}
                  >
                    {w.status}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
