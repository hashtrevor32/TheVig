import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { prisma } from "./prisma";

export const SESSION_COOKIE = "thevig_session";

export type SessionData = {
  operatorId: string;
  groupId: string;
  operatorName: string;
  isAdmin: boolean;
};

export async function getSession(): Promise<SessionData | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionData;
  } catch {
    return null;
  }
}

export async function requireSession(): Promise<SessionData> {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");
  return session;
}

export async function getGroupId(): Promise<string> {
  const session = await requireSession();
  return session.groupId;
}

/** Verify a week belongs to the current operator's group. Returns the week or calls notFound(). */
export async function requireWeekAccess(weekId: string) {
  const groupId = await getGroupId();
  const week = await prisma.week.findUnique({ where: { id: weekId } });
  if (!week || week.groupId !== groupId) notFound();
  return week;
}
