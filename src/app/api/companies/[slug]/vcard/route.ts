import { NextResponse } from "next/server";

import { listCardsForUser, listContactEventsForUser } from "@/db/cards";
import { findCompanyBySlug } from "@/lib/companies/group";
import { readSession } from "@/lib/firebase/session";
import { toVcard } from "@/lib/vcard/export";

export const dynamic = "force-dynamic";

const SCAN_LIMIT = 500;
const PER_CARD_EVENT_LIMIT = 5; // smaller than single-card export so the bundle stays compact

function safeFilename(base: string, count: number): string {
  const safe = base.replace(/[^A-Za-z0-9_\-\u3400-\u9fff]+/g, "_").slice(0, 60) || "company";
  return `${safe}-${count}-cards.vcf`;
}

/**
 * Bulk vCard export for an entire company. Concatenates each member
 * card's vCard into a single .vcf — the multi-vCard format that Apple
 * Contacts / Outlook / Google Contacts all import in one shot. Useful
 * when a business user wants to hand "the entire ACME contact list"
 * to a colleague or import to a CRM.
 *
 * Per-card events capped at 5 (vs 10 for single-card) to keep the
 * bundle byte size reasonable when companies have 10+ members.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const user = await readSession();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);

  const cards = await listCardsForUser(user.uid, {
    limit: SCAN_LIMIT,
    orderBy: "createdAt",
    order: "desc",
  });
  const group = findCompanyBySlug(cards, slug);
  if (!group) return new NextResponse("Not Found", { status: 404 });

  // Fetch contact events for each card in parallel — bounded by group
  // size, which is naturally small (typical company has 1-10 cards).
  const eventLists = await Promise.all(
    group.cards.map((c) => listContactEventsForUser(c.id, user.uid, PER_CARD_EVENT_LIMIT)),
  );

  const blocks = group.cards.map((card, i) =>
    toVcard(card, { events: eventLists[i], eventLimit: PER_CARD_EVENT_LIMIT }),
  );
  // toVcard already emits CRLF + trailing \r\n per block; concatenation
  // gives the multi-vCard structure that RFC 6350 specifies.
  const body = blocks.join("");
  const filename = safeFilename(group.displayName, group.cards.length);

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/vcard; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
