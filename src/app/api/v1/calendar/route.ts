import { NextResponse } from "next/server";
import { monthView } from "@/modules/calendar";
import { AppError } from "@/modules/core/errors";
import { jsonError, requireApiUser } from "@/lib/api";

export async function GET(req: Request) {
  try {
    const user = await requireApiUser();
    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId");
    const year = Number(url.searchParams.get("year"));
    const month = Number(url.searchParams.get("month"));
    if (!projectId) throw new AppError("缺少 projectId");
    if (!Number.isInteger(year) || !Number.isInteger(month)) {
      throw new AppError("缺少 year/month");
    }
    const cells = await monthView(user.id, projectId, year, month);
    return NextResponse.json({ cells });
  } catch (e) {
    return jsonError(e);
  }
}
