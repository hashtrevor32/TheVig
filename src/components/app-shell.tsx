"use client";

import { usePathname } from "next/navigation";
import { DesktopHeader, MobileHeader, MobileBottomNav } from "./nav";

export function AppShell({
  children,
  operatorName,
}: {
  children: React.ReactNode;
  operatorName: string;
}) {
  const pathname = usePathname();
  const isAuthPage = pathname === "/login" || pathname === "/setup";

  if (isAuthPage) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <DesktopHeader />
      <MobileHeader operatorName={operatorName} />
      <MobileBottomNav />

      <main className="md:pt-16 pb-28 md:pb-8">
        <div className="max-w-5xl mx-auto px-5 py-6 md:px-8 md:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
