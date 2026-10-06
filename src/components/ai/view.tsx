import { requireUser } from "@/modules/core";
import { AiWorkspace } from "./workspace";

export async function AiWorkspaceView() {
  const user = await requireUser();
  return <AiWorkspace key={user.id} userId={user.id} />;
}
