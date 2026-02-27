"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, password }),
      });

      if (res.ok) {
        router.push("/ev");
        router.refresh();
      } else {
        setError("Invalid credentials");
      }
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-white tracking-tight">TheVig</h1>
          <p className="text-[#6e6e73] mt-2">EV Finder & Odds Scanner</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white/[0.05] backdrop-blur-xl border border-white/[0.08] rounded-3xl p-8 space-y-5"
        >
          <div>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Username"
              className="w-full px-4 py-3.5 bg-white/[0.05] border border-white/[0.08] rounded-xl text-white placeholder-[#6e6e73] focus:outline-none focus:ring-2 focus:ring-[#0a84ff]/50 focus:border-[#0a84ff]/50"
              autoFocus
              autoCapitalize="none"
              autoCorrect="off"
            />
          </div>
          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full px-4 py-3.5 bg-white/[0.05] border border-white/[0.08] rounded-xl text-white placeholder-[#6e6e73] focus:outline-none focus:ring-2 focus:ring-[#0a84ff]/50 focus:border-[#0a84ff]/50"
            />
          </div>

          {error && (
            <p className="text-[#ff453a] text-sm text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !name || !password}
            className="w-full py-3.5 bg-[#0a84ff] hover:bg-[#0a84ff]/90 disabled:bg-white/[0.05] disabled:text-[#48484a] text-white font-semibold rounded-xl"
          >
            {loading ? "..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
