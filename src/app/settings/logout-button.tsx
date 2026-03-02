"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleLogout() {
    setLoading(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleLogout}
      disabled={loading}
      className="w-full py-3.5 bg-red-50 hover:bg-red-100 text-red-600 font-medium rounded-2xl border border-red-200"
    >
      {loading ? "Signing out..." : "Sign Out"}
    </button>
  );
}
