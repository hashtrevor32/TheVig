"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TrendingUp, Settings, Shield } from "lucide-react";

const baseNavItems = [
  { href: "/ev", label: "EV Finder", icon: TrendingUp },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function DesktopHeader({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const navItems = isAdmin
    ? [...baseNavItems, { href: "/admin", label: "Admin", icon: Shield }]
    : baseNavItems;

  return (
    <header className="hidden md:flex fixed top-0 left-0 right-0 h-16 z-50 bg-black/80 backdrop-blur-2xl border-b border-white/[0.06]">
      <div className="max-w-5xl mx-auto w-full px-8 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-white tracking-tight">TheVig</h1>
        <nav className="flex items-center gap-0.5 bg-white/[0.05] rounded-full p-1">
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
                    ? "bg-white/[0.12] text-white"
                    : "text-[#6e6e73] hover:text-white"
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

export function MobileHeader({
  groupName,
  operatorName,
}: {
  groupName: string;
  operatorName: string;
}) {
  return (
    <header className="sticky top-0 z-40 bg-black/80 backdrop-blur-2xl border-b border-white/[0.06] md:hidden">
      <div className="px-5 py-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-white tracking-tight">TheVig</h1>
        <div className="text-right">
          <span className="text-[#a1a1a6] text-sm">{groupName}</span>
          {operatorName && (
            <p className="text-[#6e6e73] text-xs">{operatorName}</p>
          )}
        </div>
      </div>
    </header>
  );
}

export function MobileBottomNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const navItems = isAdmin
    ? [...baseNavItems, { href: "/admin", label: "Admin", icon: Shield }]
    : baseNavItems;

  return (
    <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white/[0.1] backdrop-blur-2xl border border-white/[0.1] rounded-full px-2 py-1.5 z-50 md:hidden">
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
              className={`flex items-center gap-2 px-4 py-2 rounded-full ${
                isActive
                  ? "bg-white/[0.15] text-white"
                  : "text-[#6e6e73] hover:text-white"
              }`}
            >
              <Icon size={18} />
              {isActive && (
                <span className="text-xs font-medium">{item.label}</span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
