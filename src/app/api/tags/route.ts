import { NextResponse } from "next/server";

import { listTagsForUser } from "@/db/tags";
import { readSession } from "@/lib/firebase/session";

/**
 * GET /api/tags — list this workspace's tags for autocomplete.
 *
 * Kept as a Route Handler (not a Server Action) because TagInput's
 * combobox fetches on focus/keystroke and a handler is cheaper
 * round-trip than action invocation.
 */
export async function GET(): Promise<NextResponse> {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const tags = await listTagsForUser(session.uid);
  return NextResponse.json(
    {
      tags: tags.map((t) => ({ id: t.id, name: t.name, color: t.color })),
    },
    {
      headers: { "Cache-Control": "private, max-age=5" },
    },
  );
}
