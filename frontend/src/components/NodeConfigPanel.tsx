import { X } from "lucide-react";
import { Input } from "@/src/components/ui/Input";
import { getNodeDefinition } from "@/src/registry/nodes";
import { useReactFlow } from "@xyflow/react";
import { useEffect, useState } from "react";

interface NodeConfigPanelProps {
  nodeId: string;
  onClose: () => void;
}

export function NodeConfigPanel({ nodeId, onClose }: NodeConfigPanelProps) {
  const { getNode, updateNodeData } = useReactFlow();
  const node = getNode(nodeId);
  
  // Local state for immediate input feedback, synced with React Flow node data
  const [localData, setLocalData] = useState<Record<string, any>>({});

  useEffect(() => {
    if (node) {
      setLocalData(node.data || {});
    }
  }, [nodeId]); // Only reset local state when switching nodes to prevent cursor jumping

  if (!node) return null;

  const nodeType = node.data.type as string;
  const def = getNodeDefinition(nodeType);

  const handleChange = (key: string, value: string) => {
    // Update local state for immediate UI response
    setLocalData((prev) => ({ ...prev, [key]: value }));
    
    // Auto-save to React Flow state
    updateNodeData(nodeId, { [key]: value });

    // Also update the 'params' string for the NodeCard display if it's a specific field
    if (key !== 'label' && key !== 'type' && key !== 'status' && key !== 'params') {
      const newParams = Object.entries({ ...localData, [key]: value })
        .filter(([k]) => k !== 'label' && k !== 'type' && k !== 'status' && k !== 'params')
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
      updateNodeData(nodeId, { params: newParams });
    }
  };

  return (
    <div className="w-[400px] bg-[#0A0A0A] flex flex-col h-full shadow-2xl">
      <div className="h-14 border-b border-white/[0.08] flex items-center justify-between px-4">
        <h3 className="text-sm font-medium text-zinc-200">配置: {localData.label || nodeType}</h3>
        <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">节点名称</label>
            <Input 
              value={localData.label || ""} 
              onChange={(e) => handleChange("label", e.target.value)}
            />
          </div>

          {def?.fields.map((field, idx) => (
            <div key={idx} className="space-y-2">
              <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">{field.label}</label>
              {field.type === 'select' ? (
                <select 
                  value={localData[field.name] || field.defaultValue || ""}
                  onChange={(e) => handleChange(field.name, e.target.value)}
                  className="flex h-10 w-full rounded-md border border-white/[0.06] bg-zinc-900/50 px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
                >
                  {field.options?.map(opt => (
                    <option key={opt.value} value={opt.value} className="bg-zinc-800 text-zinc-200">{opt.label}</option>
                  ))}
                </select>
              ) : (
                <Input 
                  type={field.type} 
                  value={localData[field.name] || ""} 
                  onChange={(e) => handleChange(field.name, e.target.value)}
                  placeholder={field.placeholder} 
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
