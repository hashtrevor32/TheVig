"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createGroupWithOperator } from "@/lib/actions";

export function AdminClient() {
  const [groupName, setGroupName] = useState("");
  const [operatorName, setOperatorName] = useState("");
  const [operatorPassword, setOperatorPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      await createGroupWithOperator({
        groupName,
        operatorName,
        operatorPassword,
      });
      setSuccess(`Created group "${groupName}" with operator "${operatorName}"`);
      setGroupName("");
      setOperatorName("");
      setOperatorPassword("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create group");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-gray-900 rounded-xl border border-gray-800 p-4 space-y-3"
    >
      <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide">
        New Group + Operator
      </h3>
      <input
        type="text"
        value={groupName}
        onChange={(e) => setGroupName(e.target.value)}
        placeholder="Group name"
        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <div className="grid grid-cols-2 gap-3">
        <input
          type="text"
          value={operatorName}
          onChange={(e) => setOperatorName(e.target.value)}
          placeholder="Username"
          autoCapitalize="none"
          autoCorrect="off"
          className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          type="text"
          value={operatorPassword}
          onChange={(e) => setOperatorPassword(e.target.value)}
          placeholder="Password"
          className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}
      {success && <p className="text-green-400 text-sm">{success}</p>}

      <button
        type="submit"
        disabled={loading || !groupName || !operatorName || !operatorPassword}
        className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium rounded-lg transition-colors"
      >
        {loading ? "Creating..." : "Create Group"}
      </button>
    </form>
  );
}
