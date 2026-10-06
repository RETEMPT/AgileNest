import type { Metadata } from "next";
import { AiWorkspaceView } from "@/components/ai/view";

export const metadata: Metadata = { title: "AI 对话 · AgileNest" };

export default function AiPage() {
  return <AiWorkspaceView />;
}
