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
      className="w-full py-3.5 bg-[#ff453a]/10 hover:bg-[#ff453a]/15 text-[#ff453a] font-medium rounded-2xl border border-[#ff453a]/15"
    >
      {loading ? "Signing out..." : "Sign Out"}
    </button>
  );
}
