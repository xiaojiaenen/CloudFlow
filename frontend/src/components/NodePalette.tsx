import React, { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { nodeRegistry } from "@/src/registry/nodes";

export function NodePalette() {
  const categories = Array.from(new Set(nodeRegistry.map((node) => node.category)));
  const groupedNodes = categories.map((category) => ({
    title: category,
    nodes: nodeRegistry.filter((node) => node.category === category),
  }));

  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>(
    categories.reduce((acc, category) => ({ ...acc, [category]: true }), {}),
  );

  const toggleCategory = (title: string) => {
    setOpenCategories((prev) => ({ ...prev, [title]: !prev[title] }));
  };

  const onDragStart = (event: React.DragEvent, nodeType: string, label: string) => {
    event.dataTransfer.setData("application/reactflow", nodeType);
    event.dataTransfer.setData("application/reactflow-label", label);
    event.dataTransfer.effectAllowed = "move";
  };

  return (
    <div className="z-10 flex h-full w-64 flex-col border-r border-white/[0.08] bg-zinc-950/50 backdrop-blur-md">
      <div className="border-b border-white/[0.05] p-4">
        <h3 className="text-sm font-medium text-zinc-200">添加节点</h3>
        <p className="mt-1 text-xs text-zinc-500">拖拽节点到右侧画布，按业务流程串起来执行。</p>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-3">
        {groupedNodes.map((category) => (
          <div key={category.title} className="space-y-2">
            <div
              className="cursor-pointer px-1 text-xs font-medium uppercase tracking-wider text-zinc-400 transition-colors hover:text-zinc-200 flex items-center justify-between"
              onClick={() => toggleCategory(category.title)}
            >
              {category.title}
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 transition-transform duration-200",
                  openCategories[category.title] ? "" : "-rotate-90",
                )}
              />
            </div>

            <div
              className={cn(
                "space-y-2 overflow-hidden transition-all duration-300",
                openCategories[category.title] ? "max-h-[1200px] opacity-100" : "max-h-0 opacity-0",
              )}
            >
              {category.nodes.map((node) => {
                const Icon = node.icon;
                return (
                  <div
                    key={node.type}
                    className="cursor-grab rounded-lg border border-white/[0.05] bg-white/[0.02] p-3 transition-colors active:cursor-grabbing hover:border-white/[0.1] hover:bg-white/[0.06]"
                    draggable
                    onDragStart={(event) => onDragStart(event, node.type, node.label)}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn("rounded-md bg-white/[0.05] p-1.5", node.color.split(" ")[0])}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-zinc-300">{node.label}</div>
                        <div className="truncate text-[11px] text-zinc-500">{node.type}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
