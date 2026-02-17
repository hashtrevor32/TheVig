"use client";

import { useState } from "react";
import { createWeek } from "@/lib/actions";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";

export function WeekForm() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !startAt || !endAt) return;
    setLoading(true);
    const weekId = await createWeek({ name, startAt, endAt });
    setName("");
    setStartAt("");
    setEndAt("");
    setOpen(false);
    setLoading(false);
    router.push(`/weeks/${weekId}`);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg flex items-center justify-center gap-2 transition-colors"
      >
        <Plus size={18} />
        New Week
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-gray-900 rounded-xl border border-gray-800 p-4 space-y-3"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-white font-semibold">New Week</h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-gray-400 hover:text-gray-300"
        >
          <X size={18} />
        </button>
      </div>

      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Week name (e.g. Week 1)"
        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        autoFocus
      />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Start</label>
          <input
            type="date"
            value={startAt}
            onChange={(e) => setStartAt(e.target.value)}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">End</label>
          <input
            type="date"
            value={endAt}
            onChange={(e) => setEndAt(e.target.value)}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={loading || !name || !startAt || !endAt}
        className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium rounded text-sm transition-colors"
      >
        {loading ? "Creating..." : "Create Week"}
      </button>
    </form>
  );
}
