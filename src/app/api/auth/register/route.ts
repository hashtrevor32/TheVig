import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE, type SessionData } from "@/lib/auth";

export async function POST(request: Request) {
  const { username, password } = await request.json();

  if (!username || !password) {
    return NextResponse.json(
      { error: "Username and password are required" },
      { status: 400 }
    );
  }

  if (username.length < 3) {
    return NextResponse.json(
      { error: "Username must be at least 3 characters" },
      { status: 400 }
    );
  }

  if (password.length < 4) {
    return NextResponse.json(
      { error: "Password must be at least 4 characters" },
      { status: 400 }
    );
  }

  // Check if username is taken
  const existing = await prisma.operator.findUnique({
    where: { name: username },
  });

  if (existing) {
    return NextResponse.json(
      { error: "Username already taken" },
      { status: 409 }
    );
  }

  // Create a personal group (invisible to user, needed for DB schema)
  const group = await prisma.group.create({
    data: { name: `${username}'s group` },
  });

  const operator = await prisma.operator.create({
    data: {
      groupId: group.id,
      name: username,
      password: password,
      isAdmin: false,
    },
  });

  // Auto-login
  const sessionData: SessionData = {
    operatorId: operator.id,
    groupId: group.id,
    operatorName: operator.name,
    isAdmin: false,
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
