import { NextResponse } from "next/server";

import { getCardForUser } from "@/db/cards";
import { readSession } from "@/lib/firebase/session";
import { toVcard, vcardFilename } from "@/lib/vcard/export";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await readSession();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await params;
  const card = await getCardForUser(user.uid, id);
  if (!card) return new NextResponse("Not Found", { status: 404 });
  if (card.deletedAt) return new NextResponse("Gone", { status: 410 });

  const body = toVcard(card);
  const filename = vcardFilename(card);

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/vcard; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
