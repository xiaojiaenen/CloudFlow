import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  addEdge,
  Background,
  Connection,
  Controls,
  Edge,
  MiniMap,
  Node,
  NodeMouseHandler,
  ReactFlow,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { CheckSquare, ClipboardPaste, Copy, Maximize, Play, Trash2 } from "lucide-react";
import { NodeCard } from "./NodeCard";
import { CanvasNodeData, createEmptyCanvasGraph, ExecutionNodeStatus } from "@/src/lib/cloudflow";

const nodeTypes = {
  custom: NodeCard,
};

interface WorkflowCanvasProps {
  isRunning: boolean;
  onNodeSelect?: (id: string) => void;
  nodeStatuses?: Record<string, ExecutionNodeStatus>;
  onWorkflowChange?: (payload: { nodes: Node<CanvasNodeData>[]; edges: Edge[] }) => void;
  initialNodes?: Node<CanvasNodeData>[];
  initialEdges?: Edge[];
}

let id = 1000;
const getId = () => `${id++}`;

function Flow({
  isRunning,
  onNodeSelect,
  nodeStatuses,
  onWorkflowChange,
  initialNodes,
  initialEdges,
}: WorkflowCanvasProps) {
  const defaultGraph = useMemo(() => createEmptyCanvasGraph(), []);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<CanvasNodeData>>(initialNodes ?? defaultGraph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges ?? defaultGraph.edges);
  const { screenToFlowPosition, fitView } = useReactFlow();

  const [contextMenu, setContextMenu] = useState<{
    type: "pane" | "node";
    x: number;
    y: number;
    nodeId?: string;
  } | null>(null);

  const onConnect = useCallback(
    (params: Connection | Edge) => setEdges((existingEdges) => addEdge({ ...params, animated: true }, existingEdges)),
    [setEdges],
  );

  const onNodeClick: NodeMouseHandler = useCallback(
    (_, node) => {
      if (!isRunning) {
        onNodeSelect?.(node.id);
      }
    },
    [isRunning, onNodeSelect],
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData("application/reactflow");
      const label = event.dataTransfer.getData("application/reactflow-label");

      if (!type) {
        return;
      }

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode: Node<CanvasNodeData> = {
        id: getId(),
        type: "custom",
        position: {
          x: position.x - 128,
          y: position.y - 50,
        },
        data: {
          label,
          type,
          params: "",
          status: "idle",
        },
      };

      setNodes((existingNodes) => existingNodes.concat(newNode));
    },
    [screenToFlowPosition, setNodes],
  );

  const onPaneContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    setContextMenu({
      type: "pane",
      x: event.clientX,
      y: event.clientY,
    });
  }, []);

  const onNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
    event.preventDefault();
    setContextMenu({
      type: "node",
      x: event.clientX,
      y: event.clientY,
      nodeId: node.id,
    });
  }, []);

  useEffect(() => {
    const handleDismiss = () => setContextMenu(null);
    window.addEventListener("click", handleDismiss);
    window.addEventListener("scroll", handleDismiss, true);

    return () => {
      window.removeEventListener("click", handleDismiss);
      window.removeEventListener("scroll", handleDismiss, true);
    };
  }, []);

  useEffect(() => {
    setNodes((existingNodes) =>
      existingNodes.map((node) => {
        const nextStatus = nodeStatuses?.[node.id] ?? "idle";
        if (node.data.status === nextStatus) {
          return node;
        }

        return {
          ...node,
          data: {
            ...node.data,
            status: nextStatus,
          },
        };
      }),
    );
  }, [nodeStatuses, setNodes]);

  useEffect(() => {
    onWorkflowChange?.({ nodes, edges });
  }, [edges, nodes, onWorkflowChange]);

  const deleteNode = useCallback(() => {
    if (!contextMenu?.nodeId) {
      return;
    }

    setNodes((existingNodes) => existingNodes.filter((node) => node.id !== contextMenu.nodeId));
    setEdges((existingEdges) =>
      existingEdges.filter((edge) => edge.source !== contextMenu.nodeId && edge.target !== contextMenu.nodeId),
    );
  }, [contextMenu, setEdges, setNodes]);

  return (
    <>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onPaneContextMenu={onPaneContextMenu}
        onNodeContextMenu={onNodeContextMenu}
        onDrop={onDrop}
        onDragOver={onDragOver}
        nodeTypes={nodeTypes}
        fitView
        className="bg-transparent"
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#333" gap={16} size={1} />
        <Controls className="fill-zinc-400 bg-[#121212] border-white/[0.08]" />
        <MiniMap
          nodeColor={(node) => {
            switch (node.data?.type) {
              case "open_page":
                return "#3b82f6";
              case "click":
                return "#fbbf24";
              case "input":
                return "#34d399";
              case "extract":
                return "#c084fc";
              case "save":
                return "#818cf8";
              case "hover":
                return "#22d3ee";
              case "scroll":
                return "#fb923c";
              case "wait":
                return "#a1a1aa";
              case "screenshot":
                return "#f472b6";
              case "condition":
                return "#fb7185";
              default:
                return "#3f3f46";
            }
          }}
          maskColor="rgba(9, 9, 11, 0.8)"
          className="bg-zinc-950/80 border-white/[0.08] backdrop-blur-md rounded-lg overflow-hidden"
          style={{ backgroundColor: "#09090b", border: "1px solid rgba(255,255,255,0.05)" }}
        />
      </ReactFlow>

      {contextMenu && (
        <div
          className="fixed z-[9999] w-48 bg-zinc-950/90 backdrop-blur-xl border border-white/[0.08] rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] overflow-hidden py-1.5 animate-in fade-in zoom-in-95 duration-100"
          style={{
            left: Math.min(contextMenu.x, window.innerWidth - 202),
            top: Math.min(contextMenu.y, window.innerHeight - 230),
          }}
        >
          {contextMenu.type === "pane" ? (
            <>
              <button
                onClick={() => fitView({ duration: 500 })}
                className="w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-300 hover:text-zinc-100 hover:bg-sky-500/20 transition-colors"
              >
                <Maximize className="w-4 h-4" />
                适应屏幕
              </button>
              <button className="w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-300 hover:text-zinc-100 hover:bg-sky-500/20 transition-colors">
                <ClipboardPaste className="w-4 h-4" />
                粘贴节点
              </button>
              <div className="h-px bg-white/[0.08] my-1.5 mx-2" />
              <button className="w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-300 hover:text-zinc-100 hover:bg-sky-500/20 transition-colors">
                <CheckSquare className="w-4 h-4" />
                全选
              </button>
            </>
          ) : (
            <>
              <button className="w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-300 hover:text-zinc-100 hover:bg-sky-500/20 transition-colors">
                <Play className="w-4 h-4 text-emerald-400" />
                单节点执行待实现
              </button>
              <div className="h-px bg-white/[0.08] my-1.5 mx-2" />
              <button className="w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-300 hover:text-zinc-100 hover:bg-sky-500/20 transition-colors">
                <Copy className="w-4 h-4" />
                复制节点
              </button>
              <button
                onClick={deleteNode}
                className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/20 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                删除节点
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}

export function WorkflowCanvas(props: WorkflowCanvasProps) {
  return (
    <div className="flex-1 h-full bg-transparent relative">
      <Flow {...props} />
    </div>
  );
}
