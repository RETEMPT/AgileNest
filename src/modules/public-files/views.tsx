import { requireUser } from "@/modules/core";
import { listPublicFiles } from "./service";
import { PublicFilesLibrary } from "./ui";

export async function PublicFilesView() {
  const user = await requireUser();
  const files = await listPublicFiles(user.id);
  return <PublicFilesLibrary initialFiles={files} />;
}
