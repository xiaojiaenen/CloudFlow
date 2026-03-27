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
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { NodeCard } from "./NodeCard";
import { Copy, Trash2, Play, Maximize, ClipboardPaste, CheckSquare } from "lucide-react";

const initialNodes: Node[] = [
  {
    id: "1",
    type: "custom",
    position: { x: 250, y: 50 },
    data: { label: "打开目标网页", type: "navigate", params: "url: https://amazon.com" },
  },
  {
    id: "2",
    type: "custom",
    position: { x: 250, y: 200 },
    data: { label: "输入搜索词", type: "type", params: "selector: #search, text: 'MacBook'" },
  },
  {
    id: "3",
    type: "custom",
    position: { x: 250, y: 350 },
    data: { label: "点击搜索按钮", type: "click", params: "selector: .submit-btn" },
  },
  {
    id: "4",
    type: "custom",
    position: { x: 250, y: 500 },
    data: { label: "提取商品价格", type: "extract", params: "selector: .price, type: text" },
  },
  {
    id: "5",
    type: "custom",
    position: { x: 250, y: 650 },
    data: { label: "保存至数据库", type: "save", params: "table: products" },
  },
];

const initialEdges: Edge[] = [
  { id: "e1-2", source: "1", target: "2", animated: true },
  { id: "e2-3", source: "2", target: "3", animated: true },
  { id: "e3-4", source: "3", target: "4", animated: true },
  { id: "e4-5", source: "4", target: "5", animated: true },
];

const nodeTypes = {
  custom: NodeCard,
};

interface WorkflowCanvasProps {
  isRunning: boolean;
  onNodeSelect?: (id: string) => void;
}

let id = 6;
const getId = () => `${id++}`;

function Flow({ isRunning, onNodeSelect }: WorkflowCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
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
      const newNode: Node = {
        id: getId(),
        type: "custom",
        position: {
          x: position.x - 128,
          y: position.y - 50,
        },
        data: { label, type, params: "" },
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
    if (!isRunning) {
      setNodes((nds) =>
        nds.map((n) => ({
          ...n,
          data: { ...n.data, status: "idle" },
        }))
      );
      return;
    }

    const steps = [
      { id: "1", delay: 1500, duration: 3500 },
      { id: "2", delay: 5000, duration: 3000 },
      { id: "3", delay: 8000, duration: 2000 },
      { id: "4", delay: 10000, duration: 4000 },
      { id: "5", delay: 14000, duration: 2000 },
    ];

    const timeouts: NodeJS.Timeout[] = [];

    steps.forEach((step) => {
      timeouts.push(
        setTimeout(() => {
          setNodes((nds) =>
            nds.map((n) =>
              n.id === step.id ? { ...n, data: { ...n.data, status: "running" } } : n
            )
          );
        }, step.delay)
      );

      timeouts.push(
        setTimeout(() => {
          setNodes((nds) =>
            nds.map((n) =>
              n.id === step.id ? { ...n, data: { ...n.data, status: "success" } } : n
            )
          );
        }, step.delay + step.duration)
      );
    });

    return () => timeouts.forEach(clearTimeout);
  }, [isRunning, setNodes]);

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
              case 'navigate': return '#3b82f6';
              case 'click': return '#fbbf24';
              case 'type': return '#34d399';
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
                运行此节点
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
