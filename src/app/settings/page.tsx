import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LogoutButton } from "./logout-button";

export default async function SettingsPage() {
  const session = await requireSession();
  const group = await prisma.group.findUnique({
    where: { id: session.groupId },
  });

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white">Settings</h2>

      <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-gray-400 text-sm">Operator</span>
          <span className="text-white text-sm font-medium">
            {session.operatorName}
            {session.isAdmin && (
              <span className="ml-2 px-1.5 py-0.5 rounded text-xs bg-blue-500/10 text-blue-400">
                admin
              </span>
            )}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-400 text-sm">Group</span>
          <span className="text-white text-sm font-medium">
            {group?.name ?? "Unknown"}
          </span>
        </div>
      </div>

      <LogoutButton />
    </div>
  );
}
