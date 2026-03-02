import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE, type SessionData } from "@/lib/auth";

export async function GET() {
  // Check if any operators exist
  const count = await prisma.operator.count();
  return NextResponse.json({ hasOperators: count > 0 });
}

export async function POST(request: Request) {
  // Only allow setup when no operators exist
  const count = await prisma.operator.count();
  if (count > 0) {
    return NextResponse.json(
      { error: "Setup already completed. Use the login page." },
      { status: 403 }
    );
  }

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

  // Create the default group and admin operator
  const group = await prisma.group.create({
    data: { name: "Default" },
  });

  const operator = await prisma.operator.create({
    data: {
      groupId: group.id,
      name: username,
      password: password,
      isAdmin: true,
    },
  });

  // Auto-login after setup
  const sessionData: SessionData = {
    operatorId: operator.id,
    groupId: group.id,
    operatorName: operator.name,
    isAdmin: true,
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
