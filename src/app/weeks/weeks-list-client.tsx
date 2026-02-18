"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { SwipeToDelete } from "@/components/swipe-to-delete";
import { deleteWeek } from "@/lib/actions";

type WeekSummary = {
  id: string;
  name: string;
  startAt: string;
  endAt: string;
  status: string;
  memberCount: number;
  betCount: number;
};

export function WeeksListClient({ weeks }: { weeks: WeekSummary[] }) {
  const router = useRouter();

  if (weeks.length === 0) {
    return (
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-8 text-center">
        <p className="text-gray-400">No weeks yet. Create one above.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {weeks.map((w) => (
        <SwipeToDelete
          key={w.id}
          onDelete={async () => {
            await deleteWeek(w.id);
            router.refresh();
          }}
        >
          <Link
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
                  <p>{w.memberCount} members</p>
                  <p>{w.betCount} bets</p>
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
        </SwipeToDelete>
      ))}
    </div>
  );
}
