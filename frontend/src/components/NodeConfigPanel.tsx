import { useEffect, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { X } from "lucide-react";
import { Input } from "@/src/components/ui/Input";
import { getNodeDefinition } from "@/src/registry/nodes";

interface NodeConfigPanelProps {
  nodeId: string;
  onClose: () => void;
}

export function NodeConfigPanel({ nodeId, onClose }: NodeConfigPanelProps) {
  const { getNode, updateNodeData } = useReactFlow();
  const node = getNode(nodeId);
  const [localData, setLocalData] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (node) {
      setLocalData(node.data || {});
    }
  }, [node, nodeId]);

  if (!node) {
    return null;
  }

  const nodeType = node.data.type as string;
  const definition = getNodeDefinition(nodeType);

  const handleChange = (key: string, value: string) => {
    const nextData = { ...localData, [key]: value };
    setLocalData(nextData);
    updateNodeData(nodeId, { [key]: value });

    if (!["label", "type", "status", "params"].includes(key)) {
      const nextParams = Object.entries(nextData)
        .filter(([entryKey]) => !["label", "type", "status", "params"].includes(entryKey))
        .filter(([, entryValue]) => entryValue !== undefined && entryValue !== null && String(entryValue) !== "")
        .map(([entryKey, entryValue]) => `${entryKey}: ${entryValue}`)
        .join(", ");

      updateNodeData(nodeId, { params: nextParams });
    }
  };

  return (
    <div className="flex h-full w-[400px] flex-col bg-[#0A0A0A] shadow-2xl">
      <div className="flex h-14 items-center justify-between border-b border-white/[0.08] px-4">
        <h3 className="text-sm font-medium text-zinc-200">配置节点：{String(localData.label || nodeType)}</h3>
        <button onClick={onClose} className="text-zinc-500 transition-colors hover:text-zinc-300">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        <div className="space-y-4">
          <div className="rounded-lg border border-sky-500/10 bg-sky-500/5 px-3 py-3 text-xs text-sky-100">
            支持引用运行参数和变量，例如 <code>{`{{inputs.keyword}}`}</code>、<code>{`{{variables.token}}`}</code>。
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wider text-zinc-400">节点名称</label>
            <Input value={String(localData.label || "")} onChange={(event) => handleChange("label", event.target.value)} />
          </div>

          {definition?.fields.map((field) => (
            <div key={field.name} className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wider text-zinc-400">{field.label}</label>
              {field.type === "select" ? (
                <select
                  value={String(localData[field.name] || field.defaultValue || "")}
                  onChange={(event) => handleChange(field.name, event.target.value)}
                  className="flex h-10 w-full rounded-md border border-white/[0.06] bg-zinc-900/50 px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
                >
                  {field.options?.map((option) => (
                    <option key={option.value} value={option.value} className="bg-zinc-800 text-zinc-200">
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  type={field.type}
                  value={String(localData[field.name] || field.defaultValue || "")}
                  onChange={(event) => handleChange(field.name, event.target.value)}
                  placeholder={field.placeholder}
                />
              )}
            </div>
          ))}

          {definition?.fields.length === 0 && (
            <div className="rounded-lg border border-dashed border-white/[0.08] bg-white/[0.02] px-3 py-3 text-xs text-zinc-500">
              这个节点没有额外配置项，执行时会直接作用于当前页面上下文。
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
