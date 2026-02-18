import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TheVig — Betting Pool Tracker",
  description: "Weekly betting pool tracker for your friend group",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSession();
  let groupName = "";
  if (session) {
    const group = await prisma.group.findUnique({
      where: { id: session.groupId },
    });
    groupName = group?.name ?? "";
  }

  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-950 text-gray-100`}
      >
        <AppShell
          operatorName={session?.operatorName ?? ""}
          groupName={groupName}
          isAdmin={session?.isAdmin ?? false}
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}
