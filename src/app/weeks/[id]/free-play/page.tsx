import { prisma } from "@/lib/prisma";
import { requireWeekAccess } from "@/lib/auth";
import Link from "next/link";
import { FreePlayClient } from "./free-play-client";

export default async function FreePlayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireWeekAccess(id);

  const week = await prisma.week.findUnique({
    where: { id },
    include: {
      freePlayAwards: {
        include: { member: true },
        orderBy: { createdAt: "desc" },
      },
      weekMembers: {
        include: { member: true },
      },
    },
  });

  if (!week) return null;

  const members = week.weekMembers.map((wm) => ({
    id: wm.memberId,
    name: wm.member.name,
  }));

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/weeks/${id}`}
          className="text-gray-500 text-xs hover:text-gray-300"
        >
          ← {week.name}
        </Link>
        <h2 className="text-2xl font-bold text-white">Free Play Awards</h2>
      </div>

      <FreePlayClient
        weekId={id}
        members={members}
        awards={week.freePlayAwards}
        weekStatus={week.status}
      />
    </div>
  );
}
