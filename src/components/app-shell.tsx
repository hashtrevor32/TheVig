"use client";

import { usePathname } from "next/navigation";
import { DesktopHeader, MobileHeader, MobileBottomNav } from "./nav";

export function AppShell({
  children,
  operatorName,
  groupName,
  isAdmin,
}: {
  children: React.ReactNode;
  operatorName: string;
  groupName: string;
  isAdmin: boolean;
}) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";

  if (isLoginPage) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-black">
      <DesktopHeader isAdmin={isAdmin} />
      <MobileHeader groupName={groupName} operatorName={operatorName} />
      <MobileBottomNav isAdmin={isAdmin} />

      <main className="md:pt-16 pb-28 md:pb-8">
        <div className="max-w-5xl mx-auto px-5 py-6 md:px-8 md:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
