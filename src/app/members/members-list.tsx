"use client";

import { useState } from "react";
import { createMember, updateMember, deleteMember } from "@/lib/actions";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Check, X } from "lucide-react";
import { SwipeToDelete } from "@/components/swipe-to-delete";

type Member = { id: string; name: string; createdAt: Date };

export function MembersList({ members }: { members: Member[] }) {
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleAdd() {
    if (!newName.trim()) return;
    setLoading(true);
    await createMember(newName.trim());
    setNewName("");
    setShowAdd(false);
    setLoading(false);
    router.refresh();
  }

  async function handleEdit(id: string) {
    if (!editName.trim()) return;
    setLoading(true);
    await updateMember(id, editName.trim());
    setEditingId(null);
    setLoading(false);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {members.map((m) => (
        <SwipeToDelete
          key={m.id}
          onDelete={async () => {
            await deleteMember(m.id);
            router.refresh();
          }}
        >
          <div className="bg-gray-900 rounded-lg border border-gray-800 p-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-sm font-bold text-white shrink-0">
              {m.name[0]}
            </div>

            {editingId === m.id ? (
              <div className="flex-1 flex items-center gap-2">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="flex-1 px-3 py-1.5 bg-gray-800 border border-gray-600 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && handleEdit(m.id)}
                />
                <button
                  onClick={() => handleEdit(m.id)}
                  disabled={loading}
                  className="p-1.5 text-green-400 hover:bg-gray-800 rounded"
                >
                  <Check size={16} />
                </button>
                <button
                  onClick={() => setEditingId(null)}
                  className="p-1.5 text-gray-400 hover:bg-gray-800 rounded"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-between">
                <span className="text-white font-medium">{m.name}</span>
                <button
                  onClick={() => {
                    setEditingId(m.id);
                    setEditName(m.name);
                  }}
                  className="p-1.5 text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded"
                >
                  <Pencil size={14} />
                </button>
              </div>
            )}
          </div>
        </SwipeToDelete>
      ))}

      {showAdd ? (
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-3 flex items-center gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Member name"
            className="flex-1 px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />
          <button
            onClick={handleAdd}
            disabled={loading || !newName.trim()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white text-sm font-medium rounded"
          >
            Add
          </button>
          <button
            onClick={() => {
              setShowAdd(false);
              setNewName("");
            }}
            className="p-2 text-gray-400 hover:text-gray-300"
          >
            <X size={16} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="w-full py-3 border-2 border-dashed border-gray-700 rounded-lg text-gray-400 hover:border-gray-500 hover:text-gray-300 flex items-center justify-center gap-2 transition-colors"
        >
          <Plus size={18} />
          Add Member
        </button>
      )}
    </div>
  );
}
