import { AppError, tryUser } from "@/modules/core";
import { getAvatar } from "./profile-service";

export async function avatarGET(
  request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  const user = await tryUser();
  if (!user) return new Response(null, { status: 401 });
  try {
    const image = await getAvatar(user.id, (await context.params).userId);
    const etag = `"${image.hash}"`;
    const headers = {
      "Content-Type": "image/png",
      "Cache-Control": "private, no-cache",
      ETag: etag,
      "X-Content-Type-Options": "nosniff",
    };
    if (request.headers.get("if-none-match") === etag)
      return new Response(null, { status: 304, headers });
    return new Response(new Uint8Array(image.bytes), { headers });
  } catch (error) {
    if (error instanceof AppError)
      return new Response(null, { status: error.status });
    throw error;
  }
}
