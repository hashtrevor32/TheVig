import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AdminClient } from "./admin-client";

export default async function AdminPage() {
  const session = await requireSession();
  if (!session.isAdmin) redirect("/");

  const groups = await prisma.group.findMany({
    include: {
      operators: {
        select: { id: true, name: true, isAdmin: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
      _count: { select: { members: true, weeks: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white">Admin</h2>

      <AdminClient />

      <div className="space-y-4">
        {groups.map((g) => (
          <div
            key={g.id}
            className="bg-gray-900 rounded-xl border border-gray-800 p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-white font-semibold">{g.name}</h3>
              <div className="text-xs text-gray-500">
                {g._count.members} members &middot; {g._count.weeks} weeks
              </div>
            </div>
            <div className="space-y-1">
              {g.operators.map((op) => (
                <div
                  key={op.id}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-gray-300">
                    {op.name}
                    {op.isAdmin && (
                      <span className="ml-2 px-1.5 py-0.5 rounded text-xs bg-blue-500/10 text-blue-400">
                        admin
                      </span>
                    )}
                  </span>
                  <span className="text-gray-600 text-xs">
                    {new Date(op.createdAt).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
