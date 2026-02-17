import { prisma } from "@/lib/prisma";

export default async function DashboardPage() {
  const group = await prisma.group.findFirst({
    include: { members: true },
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Dashboard</h2>
        <p className="text-gray-400 text-sm mt-1">
          Welcome to TheVig — your betting pool tracker
        </p>
      </div>

      {group ? (
        <div className="space-y-4">
          {/* Group card */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white">
                  {group.name}
                </h3>
                <p className="text-gray-500 text-xs mt-1">
                  Created{" "}
                  {new Date(group.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div className="bg-blue-500/10 text-blue-400 px-3 py-1 rounded-full text-sm font-medium">
                Active
              </div>
            </div>
          </div>

          {/* Members */}
          <div>
            <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-3">
              Members ({group.members.length})
            </h3>
            <div className="space-y-2">
              {group.members.map((member) => (
                <div
                  key={member.id}
                  className="bg-gray-900 rounded-lg border border-gray-800 p-3 flex items-center gap-3"
                >
                  <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-sm font-medium text-white">
                    {member.name[0]}
                  </div>
                  <span className="text-white font-medium">{member.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Quick stats placeholder */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
              <p className="text-gray-500 text-xs uppercase tracking-wide">
                Open Weeks
              </p>
              <p className="text-2xl font-bold text-white mt-1">0</p>
            </div>
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
              <p className="text-gray-500 text-xs uppercase tracking-wide">
                Total Bets
              </p>
              <p className="text-2xl font-bold text-white mt-1">0</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-8 text-center">
          <p className="text-gray-400">
            No group found. Run the seed script to set up initial data.
          </p>
        </div>
      )}
    </div>
  );
}
