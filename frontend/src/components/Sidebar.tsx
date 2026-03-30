import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  LayoutGrid,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings,
  ShieldAlert,
  SlidersHorizontal,
  Store,
  Workflow,
  X,
} from "lucide-react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { cn } from "@/src/lib/utils";
import {
  buildWorkflowDefinition,
  createDemoCanvasGraph,
  createEmptyCanvasGraph,
  createWorkflow,
  listWorkflows,
  WORKFLOW_OPEN_BLANK_EVENT,
  WORKFLOW_SAVED_EVENT,
  WorkflowRecord,
} from "@/src/lib/cloudflow";

const navItems = [
  { path: "/", icon: LayoutGrid, label: "我的工作区" },
  { path: "/monitor", icon: Activity, label: "监控中心" },
  { path: "/store", icon: Store, label: "工作流商店" },
  { path: "/alerts", icon: ShieldAlert, label: "告警中心" },
  { path: "/admin", icon: Settings, label: "管理后台" },
  { path: "/settings", icon: SlidersHorizontal, label: "系统设置" },
];

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const currentWorkflowId = searchParams.get("workflowId");
  const [isCollapsed, setIsCollapsed] = useState(() => localStorage.getItem("sidebarCollapsed") === "true");
  const [workflows, setWorkflows] = useState<WorkflowRecord[]>([]);
  const [isLoadingWorkflows, setIsLoadingWorkflows] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCreatingWorkflow, setIsCreatingWorkflow] = useState(false);
  const [newWorkflowName, setNewWorkflowName] = useState("");

  const isWorkspacePage = location.pathname === "/";

  const fetchWorkflows = useCallback(async () => {
    try {
      setIsLoadingWorkflows(true);
      const data = await listWorkflows();
      setWorkflows(data);
    } finally {
      setIsLoadingWorkflows(false);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("sidebarCollapsed", String(isCollapsed));
  }, [isCollapsed]);

  useEffect(() => {
    void fetchWorkflows();
  }, [fetchWorkflows]);

  useEffect(() => {
    const handleSaved = () => {
      void fetchWorkflows();
    };

    window.addEventListener(WORKFLOW_SAVED_EVENT, handleSaved);
    return () => window.removeEventListener(WORKFLOW_SAVED_EVENT, handleSaved);
  }, [fetchWorkflows]);

  const isActive = (path: string) => location.pathname === path;
  const visibleWorkflows = useMemo(() => workflows.slice(0, 12), [workflows]);

  const handleCreateWorkflow = async (event: FormEvent, mode: "empty" | "demo" = "empty") => {
    event.preventDefault();

    if (!newWorkflowName.trim()) {
      return;
    }

    const graph = mode === "demo" ? createDemoCanvasGraph() : createEmptyCanvasGraph();

    try {
      setIsCreatingWorkflow(true);
      const createdWorkflow = await createWorkflow({
        name: newWorkflowName.trim(),
        description: mode === "demo" ? "从前端工作区创建的示例工作流" : "从前端工作区创建的空白工作流",
        definition: {
          ...buildWorkflowDefinition(graph.nodes, graph.edges),
          canvas: graph,
        },
      });

      window.dispatchEvent(new CustomEvent(WORKFLOW_SAVED_EVENT));
      setNewWorkflowName("");
      setIsCreateModalOpen(false);
      navigate(`/?workflowId=${createdWorkflow.id}`);
    } finally {
      setIsCreatingWorkflow(false);
    }
  };

  const openBlankWorkflow = () => {
    window.dispatchEvent(new CustomEvent(WORKFLOW_OPEN_BLANK_EVENT));
    navigate("/", { replace: !currentWorkflowId });
  };

  const selectWorkflow = (id: string) => {
    navigate(`/?workflowId=${id}`);
  };

  return (
    <>
      <div
        className={cn(
          "border-r border-white/[0.05] bg-zinc-950/50 backdrop-blur-xl flex flex-col h-full z-20 transition-all duration-300 relative",
          isCollapsed ? "w-16" : "w-64",
        )}
      >
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute -right-3 top-16 bg-zinc-900 border border-white/[0.1] text-zinc-400 hover:text-zinc-100 rounded-full p-1 z-50 shadow-md transition-transform hover:scale-110"
        >
          {isCollapsed ? <PanelLeftOpen className="w-3.5 h-3.5" /> : <PanelLeftClose className="w-3.5 h-3.5" />}
        </button>

        <div
          className={cn(
            "h-14 flex items-center border-b border-white/[0.05] cursor-pointer overflow-hidden",
            isCollapsed ? "justify-center" : "px-4",
          )}
          onClick={() => navigate("/")}
        >
          <div className="flex items-center gap-2.5 text-zinc-100 font-medium">
            <div className="min-w-[28px] w-7 h-7 rounded-lg bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center shadow-[0_0_15px_rgba(14,165,233,0.3)] border border-sky-300/20 shrink-0">
              <Workflow className="w-4 h-4 text-white" />
            </div>
            {!isCollapsed && (
              <span className="text-sm font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-zinc-100 to-zinc-400 whitespace-nowrap animate-in fade-in duration-300">
                CLOUDFLOW
              </span>
            )}
          </div>
        </div>

        <div
          className={cn(
            "flex-1 overflow-y-auto py-4 flex flex-col gap-6 overflow-x-hidden",
            isCollapsed ? "px-2" : "px-3",
          )}
        >
          <div>
            {!isCollapsed && (
              <div className="text-[11px] font-medium text-zinc-500 mb-2 px-2 uppercase tracking-wider whitespace-nowrap">
                导航
              </div>
            )}
            <div className="space-y-0.5">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.path}
                    onClick={() => navigate(item.path)}
                    title={isCollapsed ? item.label : undefined}
                    className={cn(
                      "w-full flex items-center rounded-md text-sm transition-colors",
                      isCollapsed ? "justify-center py-2.5" : "gap-2 px-2 py-1.5",
                      isActive(item.path)
                        ? "bg-white/[0.08] text-zinc-100"
                        : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200",
                    )}
                  >
                    <Icon className="w-4 h-4 opacity-70 shrink-0" />
                    {!isCollapsed && <span className="whitespace-nowrap">{item.label}</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            {!isCollapsed && (
              <div className="flex items-center justify-between mb-2 px-2">
                <div className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider whitespace-nowrap">
                  工作流
                </div>
                {isWorkspacePage && (
                  <button onClick={openBlankWorkflow} className="text-[11px] text-sky-400 hover:text-sky-300 transition-colors">
                    新建空白
                  </button>
                )}
              </div>
            )}

            <div className="space-y-0.5">
              {isLoadingWorkflows && !isCollapsed && (
                <div className="px-2 py-2 text-xs text-zinc-500">正在加载工作流...</div>
              )}

              {!isLoadingWorkflows && visibleWorkflows.length === 0 && !isCollapsed && (
                <div className="px-2 py-2 text-xs text-zinc-500">还没有保存的工作流</div>
              )}

              {visibleWorkflows.map((workflow) => {
                const active = currentWorkflowId === workflow.id && isWorkspacePage;

                return (
                  <button
                    key={workflow.id}
                    onClick={() => selectWorkflow(workflow.id)}
                    title={isCollapsed ? workflow.name : undefined}
                    className={cn(
                      "w-full flex items-center rounded-md text-sm transition-colors group",
                      isCollapsed ? "justify-center py-2.5" : "justify-between px-2 py-1.5",
                      active
                        ? "bg-white/[0.08] text-zinc-100"
                        : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200",
                    )}
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <div
                        className={cn(
                          "w-1.5 h-1.5 rounded-full shrink-0",
                          active ? "bg-sky-500 shadow-[0_0_8px_rgba(14,165,233,0.8)]" : "bg-zinc-600",
                        )}
                      />
                      {!isCollapsed && <span className="truncate whitespace-nowrap">{workflow.name}</span>}
                    </div>
                    {!isCollapsed && active && (
                      <MoreHorizontal className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="p-3 border-t border-white/[0.05]">
          <button
            onClick={() => setIsCreateModalOpen(true)}
            title={isCollapsed ? "新建工作流" : undefined}
            className={cn(
              "w-full flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 text-zinc-200 border border-white/10 rounded-md text-sm font-medium transition-colors",
              isCollapsed ? "py-2.5 px-0" : "px-3 py-2",
            )}
          >
            <Plus className="w-4 h-4 shrink-0" />
            {!isCollapsed && <span className="whitespace-nowrap">新建工作流</span>}
          </button>
        </div>
      </div>

      {isCreateModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-white/[0.08] rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.05]">
              <h3 className="text-lg font-medium text-zinc-100">新建工作流</h3>
              <button onClick={() => setIsCreateModalOpen(false)} className="text-zinc-400 hover:text-zinc-100 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={(event) => void handleCreateWorkflow(event, "empty")} className="p-5">
              <div className="space-y-4">
                <div>
                  <label htmlFor="workflowName" className="block text-sm font-medium text-zinc-400 mb-1.5">
                    工作流名称
                  </label>
                  <input
                    id="workflowName"
                    type="text"
                    autoFocus
                    value={newWorkflowName}
                    onChange={(event) => setNewWorkflowName(event.target.value)}
                    placeholder="例如：每日数据抓取"
                    className="w-full bg-zinc-950 border border-white/[0.1] rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-sky-500/50 transition-all"
                  />
                </div>
                <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-3 text-xs text-zinc-400 leading-5">
                  默认会创建空白画布。如果想快速体验执行链路，可以使用“创建示例”生成一套可直接运行的演示节点。
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-zinc-300 hover:text-zinc-100 transition-colors"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={(event) => void handleCreateWorkflow(event as unknown as FormEvent, "demo")}
                  disabled={!newWorkflowName.trim() || isCreatingWorkflow}
                  className="px-4 py-2 border border-white/10 bg-white/5 hover:bg-white/10 text-zinc-200 text-sm font-medium rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  创建示例
                </button>
                <button
                  type="submit"
                  disabled={!newWorkflowName.trim() || isCreatingWorkflow}
                  className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-white text-sm font-medium rounded-lg shadow-[0_0_15px_rgba(14,165,233,0.3)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCreatingWorkflow ? "创建中..." : "创建空白"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
