// Reversal endpoint — used by the 5-second Undo (an invisible reversal, Phase 3 §7).
import type { NextRequest } from "next/server";
import { err, reverseTransaction } from "@/mocks/store";
import { fail, ok, requireSession } from "@/mocks/http";

export async function POST(req: NextRequest, { params }: { params: Promise<{ bid: string; id: string }> }) {
  const unauthorized = requireSession(req);
  if (unauthorized) return unauthorized;
  const { id } = await params;
  if (!reverseTransaction(id)) return fail(409, err("CONFLICT", "This record was already reversed."));
  return ok({ reversed: true });
}
