import { getProjectForUser, requireUser } from "@/modules/core";
import { notFound } from "next/navigation";
import { getProjectDeliveries } from "./service";
import { DeliveryWorkspace } from "./ui";

export async function DeliveryProjectView({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<{ batch?: string }> }) {
  const actor = await requireUser(); const { projectId } = await params;
  if (!await getProjectForUser(actor.id, projectId)) notFound();
  const data = await getProjectDeliveries(actor.id, projectId);
  return <DeliveryWorkspace initial={data} selectedBatchId={(await searchParams).batch} />;
}
