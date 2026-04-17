import React, { useMemo, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { Input } from "@/src/components/ui/Input";
import { cn } from "@/src/lib/utils";
import { nodeRegistry } from "@/src/registry/nodes";

export function NodePalette() {
  const [keyword, setKeyword] = useState("");
  const categories = Array.from(new Set(nodeRegistry.map((node) => node.category)));
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>(
    categories.reduce((acc, category) => ({ ...acc, [category]: true }), {}),
  );

  const normalizedKeyword = keyword.trim().toLowerCase();
  const filteredNodes = useMemo(() => {
    if (!normalizedKeyword) {
      return nodeRegistry;
    }

    return nodeRegistry.filter((node) =>
      [node.label, node.type, node.category, node.description ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(normalizedKeyword),
    );
  }, [normalizedKeyword]);

  const groupedNodes = useMemo(
    () =>
      categories
        .map((category) => ({
          title: category,
          nodes: filteredNodes.filter((node) => node.category === category),
        }))
        .filter((category) => category.nodes.length > 0),
    [categories, filteredNodes],
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
    <div className="z-10 flex h-full w-72 flex-col border-r border-white/[0.08] bg-zinc-950/50 backdrop-blur-md">
      <div className="space-y-3 border-b border-white/[0.05] p-4">
        <div>
          <h3 className="text-sm font-medium text-zinc-200">添加节点</h3>
          <p className="mt-1 text-xs text-zinc-500">
            拖拽节点到右侧画布，按业务流程串起来执行。
          </p>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
          <Input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索节点名称、类型或用途"
            className="h-10 border-white/[0.08] bg-white/[0.03] pl-9"
          />
        </div>

        <div className="text-[11px] text-zinc-500">
          {normalizedKeyword
            ? `已找到 ${filteredNodes.length} 个节点`
            : `共 ${nodeRegistry.length} 个节点`}
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-3">
        {groupedNodes.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/[0.08] bg-white/[0.02] p-4 text-sm text-zinc-500">
            没有找到匹配的节点，试试搜索“等待”“提取”“点击”“输入”等关键词。
          </div>
        ) : (
          groupedNodes.map((category) => {
            const isOpen = normalizedKeyword ? true : openCategories[category.title];

            return (
              <div key={category.title} className="space-y-2">
                <div
                  className="flex cursor-pointer items-center justify-between px-1 text-xs font-medium uppercase tracking-wider text-zinc-400 transition-colors hover:text-zinc-200"
                  onClick={() => toggleCategory(category.title)}
                >
                  <span>{category.title}</span>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[10px] normal-case tracking-normal text-zinc-500">
                      {category.nodes.length}
                    </span>
                    <ChevronDown
                      className={cn(
                        "h-3.5 w-3.5 transition-transform duration-200",
                        isOpen ? "" : "-rotate-90",
                      )}
                    />
                  </div>
                </div>

                <div
                  className={cn(
                    "space-y-2 overflow-hidden transition-all duration-300",
                    isOpen ? "max-h-[1600px] opacity-100" : "max-h-0 opacity-0",
                  )}
                >
                  {category.nodes.map((node) => {
                    const Icon = node.icon;

                    return (
                      <div
                        key={node.type}
                        className="cursor-grab rounded-xl border border-white/[0.05] bg-white/[0.02] p-3 transition-colors active:cursor-grabbing hover:border-white/[0.1] hover:bg-white/[0.06]"
                        draggable
                        onDragStart={(event) => onDragStart(event, node.type, node.label)}
                      >
                        <div className="flex items-start gap-3">
                          <div className={cn("rounded-md bg-white/[0.05] p-1.5", node.color.split(" ")[0])}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-sm font-medium text-zinc-300">{node.label}</div>
                              <div className="rounded-full border border-white/[0.08] bg-black/20 px-2 py-0.5 text-[10px] text-zinc-500">
                                {node.fields.length} 项
                              </div>
                            </div>
                            <div className="mt-1 truncate text-[11px] text-zinc-500">{node.type}</div>
                            {node.description ? (
                              <div className="mt-2 line-clamp-2 text-[11px] leading-5 text-zinc-400">
                                {node.description}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
