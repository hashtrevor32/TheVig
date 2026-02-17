"use client";

import { useState } from "react";
import { addMemberToWeek } from "@/lib/actions";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

type Member = { id: string; name: string };

export function WeekDashboardClient({
  weekId,
  availableMembers,
}: {
  weekId: string;
  availableMembers: Member[];
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [selectedMember, setSelectedMember] = useState("");
  const [creditLimit, setCreditLimit] = useState("1000");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleAdd() {
    if (!selectedMember) return;
    setLoading(true);
    await addMemberToWeek(weekId, selectedMember, parseInt(creditLimit) || 1000);
    setSelectedMember("");
    setCreditLimit("1000");
    setShowAdd(false);
    setLoading(false);
    router.refresh();
  }

  if (availableMembers.length === 0 && !showAdd) return null;

  return (
    <div>
      {showAdd ? (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 space-y-3">
          <h3 className="text-white font-semibold text-sm">Add Member to Week</h3>
          <select
            value={selectedMember}
            onChange={(e) => setSelectedMember(e.target.value)}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select member...</option>
            {availableMembers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">
              Credit Limit (units)
            </label>
            <input
              type="number"
              value={creditLimit}
              onChange={(e) => setCreditLimit(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={loading || !selectedMember}
              className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white font-medium rounded text-sm"
            >
              {loading ? "Adding..." : "Add"}
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="w-full py-3 border-2 border-dashed border-gray-700 rounded-lg text-gray-400 hover:border-gray-500 hover:text-gray-300 flex items-center justify-center gap-2 transition-colors"
        >
          <Plus size={18} />
          Add Member to Week
        </button>
      )}
    </div>
  );
}
