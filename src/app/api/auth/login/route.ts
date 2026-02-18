import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE, type SessionData } from "@/lib/auth";

export async function POST(request: Request) {
  const { name, password } = await request.json();

  if (!name || !password) {
    return NextResponse.json({ error: "Name and password required" }, { status: 400 });
  }

  const operator = await prisma.operator.findUnique({
    where: { name },
    include: { group: true },
  });

  if (!operator || operator.password !== password) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const sessionData: SessionData = {
    operatorId: operator.id,
    groupId: operator.groupId,
    operatorName: operator.name,
    isAdmin: operator.isAdmin,
  };

  const response = NextResponse.json({ success: true });
  response.cookies.set(SESSION_COOKIE, JSON.stringify(sessionData), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });

  return response;
}
