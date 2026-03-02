import { requireSession } from "@/lib/auth";
import { LogoutButton } from "./logout-button";

export default async function SettingsPage() {
  const session = await requireSession();

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Settings</h2>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-slate-500 text-sm">Username</span>
          <span className="text-slate-900 text-sm font-medium">
            {session.operatorName}
          </span>
        </div>
      </div>

      <LogoutButton />
    </div>
  );
}
