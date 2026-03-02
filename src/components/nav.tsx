"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Settings, Sparkles, Trophy } from "lucide-react";

const navItems = [
  { href: "/ev", label: "The Board", icon: LayoutGrid },
  { href: "/sharp-picks", label: "Picks", icon: Sparkles },
  { href: "/leaderboard", label: "Rankings", icon: Trophy },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function DesktopHeader() {
  const pathname = usePathname();

  return (
    <header className="hidden md:flex fixed top-0 left-0 right-0 h-14 z-50 bg-slate-950/95 backdrop-blur-xl border-b border-slate-800">
      <div className="max-w-5xl mx-auto w-full px-8 flex items-center justify-between">
        <Link href="/ev" className="flex items-center gap-2">
          <span className="text-lg font-extrabold tracking-tight text-gradient">
            TheVig
          </span>
        </Link>
        <nav className="flex items-center gap-1 bg-slate-800/60 rounded-full p-1">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-4 py-1.5 rounded-full text-sm font-medium ${
                  isActive
                    ? "nav-active"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

export function MobileHeader({ operatorName }: { operatorName: string }) {
  return (
    <header className="sticky top-0 z-40 bg-slate-950/95 backdrop-blur-xl border-b border-slate-800 md:hidden">
      <div className="px-5 py-3 flex items-center justify-between">
        <Link href="/ev">
          <span className="text-lg font-extrabold tracking-tight text-gradient">
            TheVig
          </span>
        </Link>
        {operatorName && (
          <p className="text-slate-400 text-sm font-medium">{operatorName}</p>
        )}
      </div>
    </header>
  );
}

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-5 left-1/2 -translate-x-1/2 bg-slate-950/95 backdrop-blur-xl shadow-lg shadow-black/20 border border-slate-800 rounded-full px-2 py-1.5 z-50 md:hidden">
      <div className="flex items-center gap-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-full ${
                isActive
                  ? "bg-emerald-500 text-white shadow-sm shadow-emerald-500/30"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <Icon size={18} />
              {isActive && (
                <span className="text-xs font-semibold">{item.label}</span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
