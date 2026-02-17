"use client";

import { usePathname } from "next/navigation";
import { BottomNav, Header } from "./nav";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";

  if (isLoginPage) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen">
      <BottomNav />
      <Header groupName="Main Group" />

      {/* Main content area */}
      <main className="md:ml-56 pb-20 md:pb-0">
        <div className="max-w-4xl mx-auto px-4 py-4 md:py-6">
          {children}
        </div>
      </main>
    </div>
  );
}
