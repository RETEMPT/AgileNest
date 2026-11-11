import { NextRequest, NextResponse } from "next/server";
import { requireApiUser, jsonError } from "@/lib/api";
import { revokePersonalApiToken } from "@/modules/identity";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ tokenId: string }> },
) {
  try {
    const user = await requireApiUser();
    const { tokenId } = await params;
    await revokePersonalApiToken(user.id, tokenId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
