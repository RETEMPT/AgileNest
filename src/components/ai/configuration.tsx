"use client";

import * as Tabs from "@radix-ui/react-tabs";
import { useState, type RefObject } from "react";
import { Plug, SlidersHorizontal } from "lucide-react";
import { PluginLibraryPanel } from "./plugin-library-ui";
import { ConnectionSettings } from "./provider-settings";
import { canLeaveModelSettings } from "./model-connection";

export function AiConfiguration({ userId, initialTab = "model", saveGuardRef }: { userId: string; initialTab?: "model" | "plugins"; saveGuardRef?: RefObject<(() => boolean) | null> }) {
  const [tab, setTab] = useState(initialTab);
  return <Tabs.Root value={tab} onValueChange={(value) => { if (canLeaveModelSettings()) setTab(value as "model" | "plugins"); }}>
    <Tabs.List aria-label="AI 设置分区" className="mb-6 flex gap-1 border-b border-border">
      <Tabs.Trigger value="model" className="ui-press flex items-center gap-2 border-b-2 border-transparent px-4 py-3 text-sm text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=active]:border-brand data-[state=active]:text-brand"><SlidersHorizontal size={16} />模型配置</Tabs.Trigger>
      <Tabs.Trigger value="plugins" className="ui-press flex items-center gap-2 border-b-2 border-transparent px-4 py-3 text-sm text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=active]:border-brand data-[state=active]:text-brand"><Plug size={16} />插件库</Tabs.Trigger>
    </Tabs.List>
    <Tabs.Content value="model" forceMount className="panel-enter data-[state=inactive]:hidden"><ConnectionSettings userId={userId} saveGuardRef={saveGuardRef} /></Tabs.Content>
    <Tabs.Content value="plugins" forceMount className="panel-enter data-[state=inactive]:hidden">
      <PluginLibraryPanel userId={userId} />
    </Tabs.Content>
  </Tabs.Root>;
}
