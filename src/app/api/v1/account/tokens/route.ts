import { NextRequest, NextResponse } from "next/server";
import { requireApiUser, jsonError } from "@/lib/api";
import { createPersonalApiToken, listPersonalApiTokens } from "@/modules/identity";

export async function GET() {
  try {
    const user = await requireApiUser();
    const tokens = await listPersonalApiTokens(user.id);
    return NextResponse.json({ tokens }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireApiUser();
    const body = await req.json();
    const created = await createPersonalApiToken(user.id, body);
    return NextResponse.json({ token: created }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
