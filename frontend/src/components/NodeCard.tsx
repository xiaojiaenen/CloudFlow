import { Handle, Position } from "@xyflow/react";
import { Globe } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { getNodeDefinition } from "@/src/registry/nodes";

interface NodeData {
  label: string;
  type: string;
  params: string;
  status?: "idle" | "running" | "success" | "error" | "cancelled";
}

export function NodeCard({ data, selected }: { data: NodeData; selected: boolean }) {
  const definition = getNodeDefinition(data.type);
  const Icon = definition?.icon || Globe;
  const colors = definition?.color || "text-zinc-400 bg-zinc-400/10 border-zinc-400/20";
  const bgGradient = definition?.bgGradient || "from-zinc-500/10";

  return (
    <div
      className={cn(
        "w-64 rounded-xl border bg-zinc-950/90 backdrop-blur-xl shadow-2xl transition-all duration-300 ease-out group cursor-pointer relative",
        selected
          ? "border-sky-500/50 shadow-[0_0_30px_rgba(14,165,233,0.2)] ring-1 ring-sky-500/50 scale-[1.02]"
          : "border-white/[0.08] hover:border-white/[0.2] hover:shadow-[0_0_20px_rgba(255,255,255,0.05)]",
        data.status === "running" && "animate-breathe border-emerald-500/50 ring-1 ring-emerald-500/50",
        data.status === "cancelled" && "border-amber-500/50 ring-1 ring-amber-500/40",
      )}
    >
      <div className="absolute inset-0 rounded-xl overflow-hidden pointer-events-none">
        <div className={cn("absolute inset-0 bg-gradient-to-b to-transparent opacity-50", bgGradient)} />
      </div>

      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3 bg-zinc-900 border-2 border-zinc-500 rounded-full -top-1.5 transition-colors group-hover:border-zinc-300"
      />

      <div className="p-4 relative z-10">
        <div className="flex items-center gap-3 mb-3">
          <div className={cn("p-2 rounded-lg border shadow-inner", colors)}>
            <Icon className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-zinc-100 truncate tracking-wide">{data.label}</h3>
            <p className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium mt-0.5">{data.type}</p>
          </div>
          {data.status === "running" && (
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.8)]" />
          )}
          {data.status === "success" && (
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]" />
          )}
          {data.status === "error" && (
            <div className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]" />
          )}
          {data.status === "cancelled" && (
            <div className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.8)]" />
          )}
        </div>

        <div className="bg-black/40 rounded-lg p-2.5 border border-white/[0.05] shadow-inner">
          <p className="text-[11px] font-mono text-zinc-400 truncate" title={data.params || "未配置参数"}>
            {data.params || "未配置参数"}
          </p>
        </div>
      </div>

      {data.type === "condition" ? (
        <>
          <Handle
            type="source"
            position={Position.Bottom}
            id="true"
            className="w-3 h-3 bg-emerald-500 border-2 border-zinc-900 rounded-full -bottom-1.5 left-1/3 shadow-[0_0_10px_rgba(16,185,129,0.5)]"
          />
          <Handle
            type="source"
            position={Position.Bottom}
            id="false"
            className="w-3 h-3 bg-red-500 border-2 border-zinc-900 rounded-full -bottom-1.5 left-2/3 shadow-[0_0_10px_rgba(239,68,68,0.5)]"
          />
        </>
      ) : (
        <Handle
          type="source"
          position={Position.Bottom}
          className="w-3 h-3 bg-zinc-900 border-2 border-zinc-500 rounded-full -bottom-1.5 transition-colors group-hover:border-zinc-300"
        />
      )}
    </div>
  );
}
