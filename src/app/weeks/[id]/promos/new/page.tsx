import { prisma } from "@/lib/prisma";
import { requireWeekAccess } from "@/lib/auth";
import { notFound } from "next/navigation";
import Link from "next/link";
import { CreatePromoForm } from "./create-promo-form";

export default async function NewPromoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireWeekAccess(id);

  const week = await prisma.week.findUnique({ where: { id } });

  if (!week || week.status !== "OPEN") notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/weeks/${id}/promos`}
          className="text-gray-500 text-xs hover:text-gray-300"
        >
          &larr; Promos
        </Link>
        <h2 className="text-2xl font-bold text-white">Create Promo</h2>
      </div>

      <CreatePromoForm
        weekId={id}
        weekStart={week.startAt.toISOString()}
        weekEnd={week.endAt.toISOString()}
      />
    </div>
  );
}
