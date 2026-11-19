import { requireUser } from "@/modules/core";
import { ResourceFavoritesWorkspace } from "./favorites-ui";
export async function ResourceFavoritesView() {
  await requireUser();
  return <ResourceFavoritesWorkspace />;
}
