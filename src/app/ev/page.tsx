import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { EVFinderClient } from "./ev-finder-client";

export default async function EVFinderPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return <EVFinderClient />;
}
