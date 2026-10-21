import { NextResponse } from "next/server";
import { requireApiUser, jsonError } from "@/lib/api";

export async function GET() {
  try {
    await requireApiUser();
    return NextResponse.json({ authenticated: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return jsonError(error); }
}
