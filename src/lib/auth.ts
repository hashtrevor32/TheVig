import { cookies } from "next/headers";

const SESSION_COOKIE = "thevig_session";
const SESSION_VALUE = "authenticated";

export async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE)?.value === SESSION_VALUE;
}

export function verifyPassword(password: string): boolean {
  return password === process.env.ADMIN_PASSWORD;
}

export { SESSION_COOKIE, SESSION_VALUE };
