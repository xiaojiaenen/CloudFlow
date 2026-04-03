import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  CanvasNodeData,
  createEmptyCanvasGraph,
  ExecutionNodeStatus,
  sanitizeCanvasEdges,
  sanitizeCanvasNodes,
} from "@/src/lib/cloudflow";

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

interface CanvasSnapshot {
  nodes: Node<CanvasNodeData>[];
  edges: Edge[];
}

function getId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `node-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function cloneSnapshot(snapshot: CanvasSnapshot): CanvasSnapshot {
  return {
    nodes: snapshot.nodes.map((node) => ({
      ...node,
      position: { ...node.position },
      data: { ...node.data },
    })),
    edges: snapshot.edges.map((edge) => ({ ...edge })),
  };
}

function buildEditableSignature(nodes: Node<CanvasNodeData>[], edges: Edge[]) {
  return JSON.stringify({
    nodes: sanitizeCanvasNodes(nodes).map((node) => ({
      ...node,
      data: {
        ...node.data,
        status: undefined,
      },
    })),
    edges: sanitizeCanvasEdges(edges),
  });
}

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
  const [clipboardNode, setClipboardNode] = useState<Node<CanvasNodeData> | null>(null);

  const historyRef = useRef<CanvasSnapshot[]>([]);
  const lastCommittedSignatureRef = useRef("");
  const isRestoringHistoryRef = useRef(false);
  const pasteCountRef = useRef(0);

  const pushHistorySnapshot = useCallback((nextNodes: Node<CanvasNodeData>[], nextEdges: Edge[]) => {
    const signature = buildEditableSignature(nextNodes, nextEdges);

    if (signature === lastCommittedSignatureRef.current) {
      return;
    }

    lastCommittedSignatureRef.current = signature;

    if (isRestoringHistoryRef.current) {
      isRestoringHistoryRef.current = false;
      return;
    }

    const nextHistory = [...historyRef.current, cloneSnapshot({ nodes: nextNodes, edges: nextEdges })];
    historyRef.current = nextHistory.slice(-100);
  }, []);

  const copyNode = useCallback(
    (nodeId?: string) => {
      if (!nodeId) {
        return;
      }

      const node = nodes.find((item) => item.id === nodeId);
      if (!node) {
        return;
      }

      setClipboardNode({
        ...node,
        position: { ...node.position },
        data: {
          ...node.data,
          status: "idle",
        },
      });
      pasteCountRef.current = 0;
      setContextMenu(null);
    },
    [nodes],
  );

  const pasteNode = useCallback(() => {
    if (!clipboardNode) {
      return;
    }

    pasteCountRef.current += 1;
    const offset = 36 * pasteCountRef.current;
    const newNode: Node<CanvasNodeData> = {
      ...clipboardNode,
      id: getId(),
      position: {
        x: clipboardNode.position.x + offset,
        y: clipboardNode.position.y + offset,
      },
      selected: false,
      dragging: false,
      data: {
        ...clipboardNode.data,
        status: "idle",
      },
    };

    setNodes((existingNodes) => existingNodes.concat(newNode));
    setContextMenu(null);
  }, [clipboardNode, setNodes]);

  const undoLastChange = useCallback(() => {
    if (historyRef.current.length <= 1) {
      return;
    }

    const nextHistory = historyRef.current.slice(0, -1);
    const previous = nextHistory[nextHistory.length - 1];
    historyRef.current = nextHistory;
    isRestoringHistoryRef.current = true;
    lastCommittedSignatureRef.current = buildEditableSignature(previous.nodes, previous.edges);
    setNodes(cloneSnapshot(previous).nodes);
    setEdges(cloneSnapshot(previous).edges);
    setContextMenu(null);
  }, [setEdges, setNodes]);

  const onConnect = useCallback(
    (params: Connection | Edge) =>
      setEdges((existingEdges) => {
        const duplicated = existingEdges.some(
          (edge) =>
            edge.source === params.source &&
            edge.target === params.target &&
            (edge.sourceHandle ?? null) === (params.sourceHandle ?? null) &&
            (edge.targetHandle ?? null) === (params.targetHandle ?? null),
        );

        if (duplicated) {
          return existingEdges;
        }

        return addEdge({ ...params, animated: true }, existingEdges);
      }),
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
    pushHistorySnapshot(nodes, edges);
    onWorkflowChange?.({ nodes, edges });
  }, [edges, nodes, onWorkflowChange, pushHistorySnapshot]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        Boolean(target?.isContentEditable);

      if (isTyping) {
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        undoLastChange();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undoLastChange]);

  const deleteNode = useCallback(() => {
    if (!contextMenu?.nodeId) {
      return;
    }

    setNodes((existingNodes) => existingNodes.filter((node) => node.id !== contextMenu.nodeId));
    setEdges((existingEdges) =>
      existingEdges.filter((edge) => edge.source !== contextMenu.nodeId && edge.target !== contextMenu.nodeId),
    );
    setContextMenu(null);
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
        <Controls className="border-white/[0.08] bg-[#121212] fill-zinc-400" />
        <MiniMap
          nodeColor={(node) => {
            switch (node.data?.type) {
              case "open_page":
                return "#3b82f6";
              case "click":
                return "#fbbf24";
              case "input":
                return "#34d399";
              case "hover":
                return "#22d3ee";
              case "select_option":
                return "#d946ef";
              case "check":
              case "uncheck":
                return "#84cc16";
              case "set_variable":
                return "#818cf8";
              case "condition":
                return "#fb7185";
              case "wait":
              case "wait_for_element":
              case "wait_for_text":
              case "wait_for_class":
              case "wait_for_url":
                return "#14b8a6";
              case "switch_iframe":
              case "switch_main_frame":
                return "#6366f1";
              case "scroll":
                return "#fb923c";
              case "extract":
                return "#c084fc";
              case "screenshot":
                return "#f472b6";
              default:
                return "#3f3f46";
            }
          }}
          maskColor="rgba(9, 9, 11, 0.8)"
          className="overflow-hidden rounded-lg border-white/[0.08] bg-zinc-950/80 backdrop-blur-md"
          style={{ backgroundColor: "#09090b", border: "1px solid rgba(255,255,255,0.05)" }}
        />
      </ReactFlow>

      {contextMenu && (
        <div
          className="fixed z-[9999] w-48 overflow-hidden rounded-xl border border-white/[0.08] bg-zinc-950/90 py-1.5 shadow-[0_10px_40px_rgba(0,0,0,0.5)] backdrop-blur-xl animate-in fade-in zoom-in-95 duration-100"
          style={{
            left: Math.min(contextMenu.x, window.innerWidth - 202),
            top: Math.min(contextMenu.y, window.innerHeight - 230),
          }}
        >
          {contextMenu.type === "pane" ? (
            <>
              <button
                onClick={() => {
                  fitView({ duration: 500 });
                  setContextMenu(null);
                }}
                className="flex w-full items-center gap-3 px-3 py-2 text-sm text-zinc-300 transition-colors hover:bg-sky-500/20 hover:text-zinc-100"
              >
                <Maximize className="h-4 w-4" />
                适应画布
              </button>
              <button
                onClick={pasteNode}
                disabled={!clipboardNode}
                className="flex w-full items-center gap-3 px-3 py-2 text-sm text-zinc-300 transition-colors hover:bg-sky-500/20 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ClipboardPaste className="h-4 w-4" />
                粘贴节点
              </button>
              <div className="mx-2 my-1.5 h-px bg-white/[0.08]" />
              <button
                onClick={undoLastChange}
                className="flex w-full items-center gap-3 px-3 py-2 text-sm text-zinc-300 transition-colors hover:bg-sky-500/20 hover:text-zinc-100"
              >
                <CheckSquare className="h-4 w-4" />
                撤回上一步
              </button>
            </>
          ) : (
            <>
              <button className="flex w-full items-center gap-3 px-3 py-2 text-sm text-zinc-300 transition-colors hover:bg-sky-500/20 hover:text-zinc-100">
                <Play className="h-4 w-4 text-emerald-400" />
                单节点执行待实现
              </button>
              <div className="mx-2 my-1.5 h-px bg-white/[0.08]" />
              <button
                onClick={() => copyNode(contextMenu.nodeId)}
                className="flex w-full items-center gap-3 px-3 py-2 text-sm text-zinc-300 transition-colors hover:bg-sky-500/20 hover:text-zinc-100"
              >
                <Copy className="h-4 w-4" />
                复制节点
              </button>
              <button
                onClick={deleteNode}
                className="flex w-full items-center gap-3 px-3 py-2 text-sm text-red-400 transition-colors hover:bg-red-500/20 hover:text-red-300"
              >
                <Trash2 className="h-4 w-4" />
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
    <div className="relative h-full flex-1 bg-transparent">
      <Flow {...props} />
    </div>
  );
}
