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
      <h2 className="text-3xl font-bold text-white tracking-tight">Settings</h2>

      <div className="bg-white/[0.03] rounded-2xl border border-white/[0.06] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-[#a1a1a6] text-sm">Operator</span>
          <span className="text-white text-sm font-medium">
            {session.operatorName}
            {session.isAdmin && (
              <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-[#0a84ff]/10 text-[#0a84ff]">
                admin
              </span>
            )}
          </span>
        </div>
        <div className="border-t border-white/[0.06]" />
        <div className="flex items-center justify-between">
          <span className="text-[#a1a1a6] text-sm">Group</span>
          <span className="text-white text-sm font-medium">
            {group?.name ?? "Unknown"}
          </span>
        </div>
      </div>

      <LogoutButton />
    </div>
  );
}
