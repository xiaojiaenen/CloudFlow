import React, { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { nodeRegistry } from "@/src/registry/nodes";

export function NodePalette() {
  const categories = Array.from(new Set(nodeRegistry.map(n => n.category)));
  const groupedNodes = categories.map(cat => ({
    title: cat,
    nodes: nodeRegistry.filter(n => n.category === cat)
  }));

  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>(
    categories.reduce((acc, cat) => ({ ...acc, [cat]: true }), {})
  );

  const toggleCategory = (title: string) => {
    setOpenCategories(prev => ({ ...prev, [title]: !prev[title] }));
  };

  const onDragStart = (event: React.DragEvent, nodeType: string, label: string) => {
    event.dataTransfer.setData("application/reactflow", nodeType);
    event.dataTransfer.setData("application/reactflow-label", label);
    event.dataTransfer.effectAllowed = "move";
  };

  return (
    <div className="w-64 border-r border-white/[0.08] bg-zinc-950/50 backdrop-blur-md flex flex-col h-full z-10">
      <div className="p-4 border-b border-white/[0.05]">
        <h3 className="text-sm font-medium text-zinc-200">添加节点</h3>
        <p className="text-xs text-zinc-500 mt-1">拖拽节点到右侧画布中</p>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {groupedNodes.map((category) => (
          <div key={category.title} className="space-y-2">
            <div 
              className="flex items-center justify-between text-xs font-medium text-zinc-400 uppercase tracking-wider cursor-pointer hover:text-zinc-200 transition-colors px-1"
              onClick={() => toggleCategory(category.title)}
            >
              {category.title}
              <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-200", openCategories[category.title] ? "" : "-rotate-90")} />
            </div>
            
            <div className={cn("space-y-2 overflow-hidden transition-all duration-300", openCategories[category.title] ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0")}>
              {category.nodes.map((node) => {
                const Icon = node.icon;
                return (
                  <div
                    key={node.type}
                    className="flex items-center gap-3 p-3 rounded-lg border border-white/[0.05] bg-white/[0.02] hover:bg-white/[0.06] hover:border-white/[0.1] cursor-grab active:cursor-grabbing transition-colors"
                    draggable
                    onDragStart={(e) => onDragStart(e, node.type, node.label)}
                  >
                    <div className={cn("p-1.5 rounded-md bg-white/[0.05]", node.color.split(' ')[0])}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className="text-sm text-zinc-300 font-medium">{node.label}</span>
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
