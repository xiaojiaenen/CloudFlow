import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Archive,
  CalendarClock,
  Copy,
  LayoutGrid,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  PencilLine,
  Plus,
  Search,
  Settings,
  ShieldAlert,
  Store,
  Trash2,
} from "lucide-react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/src/context/AuthContext";
import { useOverlayDialog } from "@/src/context/OverlayDialogContext";
import { cn } from "@/src/lib/utils";
import {
  buildWorkflowDefinition,
  createDemoCanvasGraph,
  createEmptyCanvasGraph,
  createWorkflow,
  deleteWorkflow,
  duplicateWorkflow,
  listWorkflows,
  updateWorkflow,
  WORKFLOW_OPEN_BLANK_EVENT,
  WORKFLOW_SAVED_EVENT,
  WorkflowRecord,
} from "@/src/lib/cloudflow";
import { BRAND } from "@/src/lib/brand";
import { BrandMark } from "@/src/components/BrandMark";
import { Button } from "@/src/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/Dialog";
import { Input } from "@/src/components/ui/Input";

const navItems = [
  { path: "/", icon: LayoutGrid, label: "我的工作区" },
  { path: "/monitor", icon: Activity, label: "监控中心" },
  { path: "/store", icon: Store, label: "工作流商店" },
  { path: "/alerts", icon: ShieldAlert, label: "告警中心" },
  { path: "/admin", icon: Settings, label: "管理后台" },
  { path: "/settings", icon: CalendarClock, label: "调度管理中心" },
];

export function Sidebar() {
  const { user } = useAuth();
  const { confirm, prompt } = useOverlayDialog();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const currentWorkflowId = searchParams.get("workflowId");

  const [isCollapsed, setIsCollapsed] = useState(() => localStorage.getItem("sidebarCollapsed") === "true");
  const [workflows, setWorkflows] = useState<WorkflowRecord[]>([]);
  const [workflowSearch, setWorkflowSearch] = useState("");
  const [isLoadingWorkflows, setIsLoadingWorkflows] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCreatingWorkflow, setIsCreatingWorkflow] = useState(false);
  const [deletingWorkflowId, setDeletingWorkflowId] = useState<string | null>(null);
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

  const visibleNavItems = useMemo(
    () => navItems.filter((item) => item.path !== "/admin" || user?.role === "admin"),
    [user?.role],
  );

  const visibleWorkflows = useMemo(() => {
    const keyword = workflowSearch.trim().toLowerCase();
    return workflows.filter((workflow) => {
      if (workflow.status === "archived") {
        return false;
      }

      if (!keyword) {
        return true;
      }

      return (
        workflow.name.toLowerCase().includes(keyword) ||
        (workflow.description ?? "").toLowerCase().includes(keyword)
      );
    });
  }, [workflowSearch, workflows]);

  const totalVisibleWorkflowCount = useMemo(
    () => workflows.filter((workflow) => workflow.status !== "archived").length,
    [workflows],
  );

  const isActive = (path: string) => location.pathname === path;

  const createWorkflowWithMode = async (mode: "empty" | "demo") => {
    if (!newWorkflowName.trim()) {
      return;
    }

    const graph = mode === "demo" ? createDemoCanvasGraph() : createEmptyCanvasGraph();

    try {
      setIsCreatingWorkflow(true);
      const createdWorkflow = await createWorkflow({
        name: newWorkflowName.trim(),
        description: mode === "demo" ? "从工作区创建的示例工作流" : "从工作区创建的空白工作流",
        status: mode === "demo" ? "active" : "draft",
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

  const removeWorkflow = async (workflow: WorkflowRecord) => {
    const confirmed = await confirm({
      title: "删除工作流",
      description: `确认删除“${workflow.name}”吗？删除后会从工作区隐藏，但历史任务仍会保留。`,
      confirmText: "确认删除",
      cancelText: "暂不删除",
      tone: "danger",
    });
    if (!confirmed) {
      return;
    }

    try {
      setDeletingWorkflowId(workflow.id);
      await deleteWorkflow(workflow.id);
      window.dispatchEvent(new CustomEvent(WORKFLOW_SAVED_EVENT));

      if (currentWorkflowId === workflow.id && isWorkspacePage) {
        window.dispatchEvent(new CustomEvent(WORKFLOW_OPEN_BLANK_EVENT));
        navigate("/", { replace: true });
      }
    } finally {
      setDeletingWorkflowId(null);
    }
  };

  const renameWorkflow = async (workflow: WorkflowRecord) => {
    const nextName = await prompt({
      title: "重命名工作流",
      description: "修改后会立即同步到工作区和任务入口。",
      label: "工作流名称",
      placeholder: "输入新的工作流名称",
      defaultValue: workflow.name,
      inputHint: "建议使用清晰的业务名称，方便在侧边栏、监控中心和调度中心快速识别。",
      confirmText: "保存名称",
      cancelText: "取消",
    });

    if (nextName === null) {
      return;
    }

    const normalizedName = nextName.trim();
    if (!normalizedName || normalizedName === workflow.name) {
      return;
    }

    await updateWorkflow(workflow.id, {
      name: normalizedName,
    });
    window.dispatchEvent(new CustomEvent(WORKFLOW_SAVED_EVENT));
  };

  const duplicateExistingWorkflow = async (workflow: WorkflowRecord) => {
    const duplicated = await duplicateWorkflow(workflow.id);
    window.dispatchEvent(new CustomEvent(WORKFLOW_SAVED_EVENT));
    navigate(`/?workflowId=${duplicated.id}`);
  };

  const archiveWorkflow = async (workflow: WorkflowRecord) => {
    const confirmed = await confirm({
      title: "归档工作流",
      description: `确认归档“${workflow.name}”吗？归档后会从常用工作区隐藏，并自动停用调度。`,
      confirmText: "确认归档",
      cancelText: "保留在工作区",
    });
    if (!confirmed) {
      return;
    }

    await updateWorkflow(workflow.id, {
      status: "archived",
      schedule: {
        enabled: false,
      },
    });
    window.dispatchEvent(new CustomEvent(WORKFLOW_SAVED_EVENT));

    if (currentWorkflowId === workflow.id && isWorkspacePage) {
      window.dispatchEvent(new CustomEvent(WORKFLOW_OPEN_BLANK_EVENT));
      navigate("/", { replace: true });
    }
  };

  return (
    <>
      <div
        className={cn(
          "relative z-20 flex h-full flex-col border-r border-white/[0.06] bg-[linear-gradient(180deg,rgba(5,10,18,0.96),rgba(8,9,12,0.94))] backdrop-blur-xl transition-all duration-300",
          isCollapsed ? "w-16" : "w-80",
        )}
      >
        <button
          type="button"
          onClick={() => setIsCollapsed((current) => !current)}
          className="absolute -right-3 top-16 z-50 rounded-full border border-white/[0.1] bg-zinc-900 text-zinc-400 shadow-md transition-transform hover:scale-110 hover:text-zinc-100"
          title={isCollapsed ? "展开侧边栏" : "收起侧边栏"}
        >
          {isCollapsed ? <PanelLeftOpen className="h-7 w-7 p-1.5" /> : <PanelLeftClose className="h-7 w-7 p-1.5" />}
        </button>

        <button
          type="button"
          onClick={() => navigate("/")}
          className={cn(
            "group flex h-16 items-center border-b border-white/[0.06] transition-colors",
            isCollapsed ? "justify-center" : "px-4",
          )}
        >
          <div className="flex items-center gap-3">
            <BrandMark compact />
            {!isCollapsed ? (
              <div className="min-w-0 text-left">
                <div className="text-sm font-semibold tracking-[0.2em] text-zinc-50">{BRAND.name.toUpperCase()}</div>
                <div className="mt-0.5 text-[11px] text-zinc-500">{BRAND.tagline}</div>
              </div>
            ) : null}
          </div>
        </button>

        <div className={cn("flex min-h-0 flex-1 flex-col", isCollapsed ? "px-2 py-4" : "px-3 py-4")}>
          <div>
            {!isCollapsed ? (
              <div className="mb-2 px-2 text-[11px] font-medium uppercase tracking-[0.24em] text-zinc-500">导航</div>
            ) : null}
            <div className="space-y-1">
              {visibleNavItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.path}
                    type="button"
                    onClick={() => navigate(item.path)}
                    title={isCollapsed ? item.label : undefined}
                    className={cn(
                      "flex w-full items-center rounded-xl text-sm transition-colors",
                      isCollapsed ? "justify-center py-2.5" : "gap-3 px-3 py-2.5",
                      isActive(item.path)
                        ? "border border-sky-400/15 bg-sky-500/10 text-zinc-50 shadow-[inset_0_1px_0_rgba(125,211,252,0.08)]"
                        : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0 opacity-80" />
                    {!isCollapsed ? <span className="truncate">{item.label}</span> : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-6 flex min-h-0 flex-1 flex-col">
            {!isCollapsed ? (
              <div className="mb-3 flex items-start justify-between gap-3 px-2">
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-[0.24em] text-zinc-500">工作流</div>
                  <div className="mt-1 text-xs text-zinc-600">
                    {visibleWorkflows.length} / {totalVisibleWorkflowCount} 个可见
                  </div>
                </div>
                {isWorkspacePage ? (
                  <button
                    type="button"
                    onClick={openBlankWorkflow}
                    className="rounded-full border border-sky-400/20 bg-sky-500/10 px-2.5 py-1 text-[11px] text-sky-200 transition-colors hover:bg-sky-500/15"
                  >
                    空白新建
                  </button>
                ) : null}
              </div>
            ) : null}

            {!isCollapsed ? (
              <div className="mb-3 px-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
                  <Input
                    value={workflowSearch}
                    onChange={(event) => setWorkflowSearch(event.target.value)}
                    placeholder="搜索工作流"
                    className="h-9 rounded-xl border-white/[0.06] bg-white/[0.03] pl-9"
                  />
                </div>
              </div>
            ) : null}

            <div
              className={cn("min-h-0 flex-1", !isCollapsed && "rounded-2xl border border-white/[0.04] bg-white/[0.02] p-2")}
            >
              <div className="h-full space-y-1 overflow-y-auto pr-1">
                {isLoadingWorkflows && !isCollapsed ? (
                  <div className="px-3 py-3 text-xs text-zinc-500">正在加载工作流...</div>
                ) : null}

                {!isLoadingWorkflows && visibleWorkflows.length === 0 && !isCollapsed ? (
                  <div className="rounded-xl border border-dashed border-white/[0.08] bg-black/20 px-3 py-4 text-xs leading-6 text-zinc-500">
                    {workflowSearch.trim()
                      ? "没有匹配的工作流，试试换一个关键词。"
                      : "还没有可用的工作流，先创建一个空白画布开始搭建吧。"}
                  </div>
                ) : null}

                {visibleWorkflows.map((workflow) => {
                  const active = currentWorkflowId === workflow.id && isWorkspacePage;

                  return (
                    <div
                      key={workflow.id}
                      onClick={() => selectWorkflow(workflow.id)}
                      title={workflow.name}
                      className={cn(
                        "group flex cursor-pointer rounded-xl text-sm transition-colors",
                        isCollapsed ? "items-center justify-center py-2.5" : "items-start justify-between gap-3 px-3 py-2.5",
                        active
                          ? "border border-sky-400/15 bg-sky-500/10 text-zinc-50"
                          : "text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200",
                      )}
                    >
                      <div className="flex min-w-0 items-start gap-2.5">
                        <div
                          className={cn(
                            "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                            active ? "bg-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.8)]" : "bg-zinc-600",
                          )}
                        />
                        {!isCollapsed ? (
                          <div className="min-w-0 flex-1">
                            <div className="max-w-[180px] truncate text-[13px] font-medium leading-5" title={workflow.name}>
                              {workflow.name}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              {workflow.status === "draft" ? (
                                <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300">
                                  草稿
                                </span>
                              ) : null}
                              {workflow.scheduleEnabled ? (
                                <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-300">
                                  已调度
                                </span>
                              ) : null}
                            </div>
                          </div>
                        ) : null}
                      </div>

                      {!isCollapsed ? (
                        <div className="flex shrink-0 items-center gap-1">
                          {active ? <MoreHorizontal className="h-4 w-4 text-zinc-600" /> : null}
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              void renameWorkflow(workflow);
                            }}
                            className="rounded-md p-1 text-zinc-500 opacity-0 transition-opacity hover:bg-white/[0.06] hover:text-zinc-200 group-hover:opacity-100"
                            title="重命名"
                          >
                            <PencilLine className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              void duplicateExistingWorkflow(workflow);
                            }}
                            className="rounded-md p-1 text-zinc-500 opacity-0 transition-opacity hover:bg-sky-500/10 hover:text-sky-300 group-hover:opacity-100"
                            title="复制"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              void archiveWorkflow(workflow);
                            }}
                            className="rounded-md p-1 text-zinc-500 opacity-0 transition-opacity hover:bg-amber-500/10 hover:text-amber-300 group-hover:opacity-100"
                            title="归档"
                          >
                            <Archive className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={deletingWorkflowId === workflow.id}
                            onClick={(event) => {
                              event.stopPropagation();
                              void removeWorkflow(workflow);
                            }}
                            className="rounded-md p-1 text-zinc-500 opacity-0 transition-opacity hover:bg-red-500/10 hover:text-red-300 group-hover:opacity-100 disabled:opacity-40"
                            title="删除"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-white/[0.06] p-3">
          <Button
            type="button"
            onClick={() => setIsCreateModalOpen(true)}
            title={isCollapsed ? "新建工作流" : undefined}
            className={cn(
              "w-full gap-2 rounded-xl bg-white/5 py-2.5 text-zinc-100 hover:bg-white/10",
              isCollapsed && "px-0",
            )}
          >
            <Plus className="h-4 w-4 shrink-0" />
            {!isCollapsed ? <span>新建工作流</span> : null}
          </Button>
        </div>
      </div>

      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen} className="max-w-xl">
        <DialogHeader>
          <DialogTitle>创建工作流</DialogTitle>
          <DialogDescription>
            从空白画布开始搭建，或者先用示例节点快速跑通一条执行链路。
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void createWorkflowWithMode("empty");
          }}
        >
          <DialogContent className="space-y-5">
            <div className="rounded-2xl border border-sky-400/10 bg-sky-500/5 px-4 py-4 text-sm leading-6 text-sky-100">
              默认会创建空白画布，适合按你的业务流程从头搭建。如果只是想快速验证执行链路，也可以直接创建示例工作流。
            </div>
            <div className="space-y-2">
              <label htmlFor="workflowName" className="block text-sm font-medium text-zinc-300">
                工作流名称
              </label>
              <Input
                id="workflowName"
                type="text"
                autoFocus
                value={newWorkflowName}
                onChange={(event) => setNewWorkflowName(event.target.value)}
                placeholder="例如：每日数据回收"
                className="h-11 rounded-xl"
              />
            </div>
          </DialogContent>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setIsCreateModalOpen(false)}>
              取消
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void createWorkflowWithMode("demo")}
              disabled={!newWorkflowName.trim() || isCreatingWorkflow}
            >
              创建示例
            </Button>
            <Button type="submit" disabled={!newWorkflowName.trim() || isCreatingWorkflow}>
              {isCreatingWorkflow ? "创建中..." : "创建空白"}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </>
  );
}
