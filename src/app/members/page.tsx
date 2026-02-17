import { prisma } from "@/lib/prisma";
import { MembersList } from "./members-list";

export default async function MembersPage() {
  const group = await prisma.group.findFirst();
  const members = await prisma.member.findMany({
    where: { groupId: group?.id },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white">Members</h2>
      <MembersList members={members} />
    </div>
  );
}
