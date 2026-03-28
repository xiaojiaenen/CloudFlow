import React, { useCallback, useEffect, useState } from "react";
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  NodeMouseHandler,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { NodeCard } from "./NodeCard";
import { Copy, Trash2, Play, Maximize, ClipboardPaste, CheckSquare } from "lucide-react";
import { CanvasNodeData, ExecutionNodeStatus } from "@/src/lib/cloudflow";

const initialNodes: Node<CanvasNodeData>[] = [
  {
    id: "1",
    type: "custom",
    position: { x: 250, y: 50 },
    data: {
      label: "打开目标网页",
      type: "open_page",
      url: "data:text/html,%3C!doctype%20html%3E%3Chtml%3E%3Cbody%20style%3D%22font-family%3AArial%3Bpadding%3A40px%3Bbackground%3A%230f172a%3Bcolor%3Awhite%22%3E%3Ch1%3ECloudFlow%20Demo%3C%2Fh1%3E%3Cinput%20id%3D%22username%22%20placeholder%3D%22username%22%20style%3D%22display%3Ablock%3Bmargin-bottom%3A12px%3Bpadding%3A10px%3Bwidth%3A240px%22%20%2F%3E%3Cbutton%20id%3D%22login%22%20style%3D%22padding%3A10px%2016px%22%20onclick%3D%22document.getElementById(%27result%27).textContent%20%3D%20%27Login%20clicked%27%22%3ELogin%3C%2Fbutton%3E%3Cp%20id%3D%22result%22%20style%3D%22margin-top%3A16px%22%3EWaiting...%3C%2Fp%3E%3C%2Fbody%3E%3C%2Fhtml%3E",
      params: "url: cloudflow demo page",
      status: "idle",
    },
  },
  {
    id: "2",
    type: "custom",
    position: { x: 250, y: 200 },
    data: {
      label: "输入账号",
      type: "input",
      selector: "#username",
      value: "test",
      params: "selector: #username, value: test",
      status: "idle",
    },
  },
  {
    id: "3",
    type: "custom",
    position: { x: 250, y: 350 },
    data: {
      label: "点击登录按钮",
      type: "click",
      selector: "#login",
      params: "selector: #login",
      status: "idle",
    },
  },
  {
    id: "4",
    type: "custom",
    position: { x: 250, y: 500 },
    data: {
      label: "等待页面稳定",
      type: "wait",
      time: "1500",
      params: "time: 1500",
      status: "idle",
    },
  },
];

const initialEdges: Edge[] = [
  { id: "e1-2", source: "1", target: "2", animated: true },
  { id: "e2-3", source: "2", target: "3", animated: true },
  { id: "e3-4", source: "3", target: "4", animated: true },
];

const nodeTypes = {
  custom: NodeCard,
};

interface WorkflowCanvasProps {
  isRunning: boolean;
  onNodeSelect?: (id: string) => void;
  nodeStatuses?: Record<string, ExecutionNodeStatus>;
  onWorkflowChange?: (payload: { nodes: Node<CanvasNodeData>[]; edges: Edge[] }) => void;
}

let id = 6;
const getId = () => `${id++}`;

function Flow({ isRunning, onNodeSelect, nodeStatuses, onWorkflowChange }: WorkflowCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<CanvasNodeData>>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const { screenToFlowPosition, fitView } = useReactFlow();

  const [contextMenu, setContextMenu] = useState<{
    type: 'pane' | 'node';
    x: number;
    y: number;
    nodeId?: string;
  } | null>(null);

  const onConnect = useCallback(
    (params: Connection | Edge) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const onNodeClick: NodeMouseHandler = useCallback(
    (_, node) => {
      if (onNodeSelect) {
        onNodeSelect(node.id);
      }
    },
    [onNodeSelect]
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

      if (typeof type === "undefined" || !type) {
        return;
      }

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      // Offset by half the node's width (256px / 2 = 128) and approximate half height (100px / 2 = 50)
      // This ensures the node appears exactly where the mouse cursor is, making it feel more responsive.
      const newNode: Node<CanvasNodeData> = {
        id: getId(),
        type: "custom",
        position: {
          x: position.x - 128,
          y: position.y - 50,
        },
        data: { label, type, params: "", status: "idle" },
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [screenToFlowPosition, setNodes]
  );

  const onPaneContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    (e.nativeEvent as any).customContextMenuHandled = true;
    setContextMenu({
      type: 'pane',
      x: e.clientX,
      y: e.clientY,
    });
  }, []);

  const onNodeContextMenu = useCallback((e: React.MouseEvent, node: Node) => {
    e.preventDefault();
    (e.nativeEvent as any).customContextMenuHandled = true;
    setContextMenu({
      type: 'node',
      x: e.clientX,
      y: e.clientY,
      nodeId: node.id,
    });
  }, []);

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    window.addEventListener('scroll', handleClick, true);
    return () => {
      window.removeEventListener('click', handleClick);
      window.removeEventListener('scroll', handleClick, true);
    };
  }, []);

  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => ({
        ...node,
        data: {
          ...node.data,
          status: nodeStatuses?.[node.id] ?? "idle",
        },
      })),
    );
  }, [nodeStatuses, setNodes]);

  useEffect(() => {
    onWorkflowChange?.({ nodes, edges });
  }, [edges, nodes, onWorkflowChange]);

  const deleteNode = useCallback(() => {
    if (contextMenu?.nodeId) {
      setNodes((nds) => nds.filter((n) => n.id !== contextMenu.nodeId));
      setEdges((eds) => eds.filter((e) => e.source !== contextMenu.nodeId && e.target !== contextMenu.nodeId));
    }
  }, [contextMenu, setNodes, setEdges]);

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
              case 'open_page': return '#3b82f6';
              case 'click': return '#fbbf24';
              case 'input': return '#34d399';
              case 'extract': return '#c084fc';
              case 'save': return '#818cf8';
              case 'hover': return '#22d3ee';
              case 'scroll': return '#fb923c';
              case 'wait': return '#a1a1aa';
              case 'screenshot': return '#f472b6';
              case 'condition': return '#fb7185';
              default: return '#3f3f46';
            }
          }}
          maskColor="rgba(9, 9, 11, 0.8)"
          className="bg-zinc-950/80 border-white/[0.08] backdrop-blur-md rounded-lg overflow-hidden"
          style={{ backgroundColor: '#09090b', border: '1px solid rgba(255,255,255,0.05)' }}
        />
      </ReactFlow>

      {/* Context Menus */}
      {contextMenu && (
        <div
          className="fixed z-[9999] w-48 bg-zinc-950/90 backdrop-blur-xl border border-white/[0.08] rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] overflow-hidden py-1.5 animate-in fade-in zoom-in-95 duration-100"
          style={{ 
            left: Math.min(contextMenu.x, window.innerWidth - 192 - 10), 
            top: Math.min(contextMenu.y, window.innerHeight - 220 - 10) 
          }}
        >
          {contextMenu.type === 'pane' ? (
            <>
              <button
                onClick={() => fitView({ duration: 500 })}
                className="w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-300 hover:text-zinc-100 hover:bg-sky-500/20 transition-colors"
              >
                <Maximize className="w-4 h-4" />
                适应屏幕
              </button>
              <button
                className="w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-300 hover:text-zinc-100 hover:bg-sky-500/20 transition-colors"
              >
                <ClipboardPaste className="w-4 h-4" />
                粘贴节点
              </button>
              <div className="h-px bg-white/[0.08] my-1.5 mx-2" />
              <button
                className="w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-300 hover:text-zinc-100 hover:bg-sky-500/20 transition-colors"
              >
                <CheckSquare className="w-4 h-4" />
                全选
              </button>
            </>
          ) : (
            <>
              <button
                className="w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-300 hover:text-zinc-100 hover:bg-sky-500/20 transition-colors"
              >
                <Play className="w-4 h-4 text-emerald-400" />
                单节点执行待实现
              </button>
              <div className="h-px bg-white/[0.08] my-1.5 mx-2" />
              <button
                className="w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-300 hover:text-zinc-100 hover:bg-sky-500/20 transition-colors"
              >
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
