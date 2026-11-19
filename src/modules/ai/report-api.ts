import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api";
import { AppError } from "@/modules/core";
import { ACCOUNT_CHANGED_MESSAGE } from "@/components/account-context";
import { requireModelRequestOrigin, readModelRequestBody } from "./api";
import { MODEL_COOKIE_NAME } from "./credentials";
import { generateProjectReport } from "./report";

const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
function json(value: unknown, status = 200) { return NextResponse.json(value, { status, headers }); }
function errorResponse(error: unknown) {
  const response = error instanceof AppError ? json({ error: error.message }, error.status) : json({ error: "报告暂时无法生成，请稍后重试" }, 500);
  if (error instanceof AppError && error.status === 409 && error.message === ACCOUNT_CHANGED_MESSAGE) response.headers.set("X-AgileNest-Account-Changed", "1");
  return response;
}

export async function projectReportPOST(request: NextRequest) {
  try {
    requireModelRequestOrigin(request);
    const user = await requireApiUser();
    return json(await generateProjectReport(user.id, request.cookies.get(MODEL_COOKIE_NAME)?.value, await readModelRequestBody(request), request.signal));
  } catch (error) { return errorResponse(error); }
}
