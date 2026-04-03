import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  CalendarClock,
  Clock3,
  KeyRound,
  Mail,
  PauseCircle,
  RefreshCw,
  Settings2,
  UserRound,
  Workflow,
} from "lucide-react";
import { Sidebar } from "@/src/components/Sidebar";
import { AppTopbar } from "@/src/components/AppTopbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/Card";
import { Button } from "@/src/components/ui/Button";
import { Input } from "@/src/components/ui/Input";
import { Select } from "@/src/components/ui/Select";
import { useAuth } from "@/src/context/AuthContext";
import { useOverlayDialog } from "@/src/context/OverlayDialogContext";
import {
  changeCurrentUserPassword,
  listWorkflowSchedules,
  updateCurrentUserProfile,
  updateWorkflow,
  WorkflowScheduleRecord,
} from "@/src/lib/cloudflow";
import { cn } from "@/src/lib/utils";

function formatDateTime(value?: string | null) {
  if (!value) {
    return "--";
  }

  return new Date(value).toLocaleString("zh-CN", {
    hour12: false,
  });
}

function getTaskStatusMeta(
  status?: WorkflowScheduleRecord["lastScheduledTask"] extends infer T
    ? T extends { status: infer S }
      ? S
      : never
    : never,
) {
  if (status === "running") {
    return {
      label: "运行中",
      className: "bg-sky-500/10 text-sky-300 border border-sky-500/20",
    };
  }

  if (status === "success") {
    return {
      label: "最近成功",
      className: "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20",
    };
  }

  if (status === "failed") {
    return {
      label: "最近失败",
      className: "bg-red-500/10 text-red-300 border border-red-500/20",
    };
  }

  if (status === "cancelled") {
    return {
      label: "已取消",
      className: "bg-amber-500/10 text-amber-300 border border-amber-500/20",
    };
  }

  return {
    label: "等待中",
    className: "bg-zinc-500/10 text-zinc-300 border border-zinc-500/20",
  };
}

export default function Settings() {
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const { confirm } = useOverlayDialog();
  const [schedules, setSchedules] = useState<WorkflowScheduleRecord[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(6);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "running" | "success" | "failed" | "cancelled" | "pending" | "never"
  >("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [updatingWorkflowId, setUpdatingWorkflowId] = useState<string | null>(null);
  const [profileName, setProfileName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");

  const loadSchedules = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await listWorkflowSchedules({
        page,
        pageSize,
        search,
        lastStatus: statusFilter,
      });

      if (data.page !== page) {
        setPage(data.page);
        return;
      }

      setSchedules(data.items);
      setTotal(data.total);
      setTotalPages(data.totalPages);
      setSelectedIds((current) => current.filter((id) => data.items.some((item) => item.id === id)));
    } finally {
      setIsLoading(false);
    }
  }, [page, pageSize, search, statusFilter]);

  useEffect(() => {
    void loadSchedules();
  }, [loadSchedules]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  useEffect(() => {
    setProfileName(user?.name ?? "");
  }, [user?.name]);

  const metrics = useMemo(() => {
    const withAlerts = schedules.filter((item) => Boolean(item.alertEmail)).length;
    const withLastSuccess = schedules.filter((item) => item.lastScheduledTask?.status === "success").length;
    const withLastFailure = schedules.filter((item) => item.lastScheduledTask?.status === "failed").length;

    return {
      total,
      withAlerts,
      withLastSuccess,
      withLastFailure,
    };
  }, [schedules, total]);

  const disableSchedule = async (item: WorkflowScheduleRecord) => {
    const confirmed = await confirm({
      title: "停用调度",
      description: `确认停用工作流“${item.name}”的定时调度吗？这不会删除历史任务。`,
      confirmText: "确认停用",
      cancelText: "取消",
      tone: "danger",
    });
    if (!confirmed) {
      return;
    }

    try {
      setUpdatingWorkflowId(item.id);
      await updateWorkflow(item.id, {
        schedule: {
          enabled: false,
        },
      });
      await loadSchedules();
    } finally {
      setUpdatingWorkflowId(null);
    }
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  };

  const disableSelectedSchedules = async () => {
    if (selectedIds.length === 0) {
      return;
    }

    const confirmed = await confirm({
      title: "批量停用调度",
      description: `确认停用当前选中的 ${selectedIds.length} 个调度任务吗？`,
      confirmText: "确认停用",
      cancelText: "取消",
      tone: "danger",
    });
    if (!confirmed) {
      return;
    }

    try {
      setUpdatingWorkflowId("batch");
      for (const workflowId of selectedIds) {
        await updateWorkflow(workflowId, {
          schedule: {
            enabled: false,
          },
        });
      }
      setSelectedIds([]);
      await loadSchedules();
    } finally {
      setUpdatingWorkflowId(null);
    }
  };

  const statusOptions = [
    { value: "all", label: "全部状态", description: "查看全部调度记录", group: "执行状态" },
    { value: "never", label: "从未执行", description: "已配置但尚未产生历史任务", group: "执行状态" },
    { value: "running", label: "运行中", description: "最近一次任务仍在运行", group: "执行状态" },
    { value: "success", label: "最近成功", description: "最近一次任务执行成功", group: "执行状态" },
    { value: "failed", label: "最近失败", description: "最近一次任务执行失败", tone: "danger" as const, group: "执行状态" },
    { value: "cancelled", label: "最近已取消", description: "最近一次任务被取消", group: "执行状态" },
    { value: "pending", label: "等待中", description: "最近一次任务还在等待执行", group: "执行状态" },
  ];

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#09090b] font-sans text-zinc-50 selection:bg-sky-500/30">
      <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(56,189,248,0.12),rgba(255,255,255,0))]" />

      <Sidebar />
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <AppTopbar
          title="调度总览"
          subtitle="集中管理所有已启用的 Cron 调度、历史状态与批量停用操作。"
          badge="Scheduler"
          actions={
            <>
              <Button variant="outline" onClick={() => void loadSchedules()} className="gap-2">
                <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
                刷新调度
              </Button>
              <Button
                variant="outline"
                disabled={selectedIds.length === 0 || updatingWorkflowId === "batch"}
                onClick={() => void disableSelectedSchedules()}
                className="gap-2 border-amber-500/20 text-amber-200 hover:bg-amber-500/10"
              >
                <PauseCircle className="h-4 w-4" />
                {updatingWorkflowId === "batch" ? "批量停用中..." : `批量停用 (${selectedIds.length})`}
              </Button>
            </>
          }
        />

        <div className="flex-1 overflow-y-auto p-8">
          <div className="mx-auto max-w-6xl space-y-8">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <MetricCard label="已启用调度" value={metrics.total} accent="text-zinc-100" />
              <MetricCard label="已配置告警" value={metrics.withAlerts} accent="text-sky-400" />
              <MetricCard label="最近成功" value={metrics.withLastSuccess} accent="text-emerald-400" />
              <MetricCard label="最近失败" value={metrics.withLastFailure} accent="text-red-400" />
            </div>

            <Card className="xl:flex xl:max-h-[680px] xl:flex-col">
              <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-3">
                  <CalendarClock className="h-5 w-5 shrink-0 text-sky-400" />
                  <div>
                    <CardTitle>全部定时工作流</CardTitle>
                    <CardDescription>按状态筛选、按名称搜索，并在这里快速打开工作流或跳转到任务监控。</CardDescription>
                  </div>
                </div>
                <div className="text-xs text-zinc-500">
                  {isLoading ? "正在同步..." : `第 ${page} / ${totalPages} 页 · 共 ${total} 条调度`}
                </div>
              </CardHeader>
              <CardContent className="space-y-4 xl:flex xl:min-h-0 xl:flex-1 xl:flex-col">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_220px_180px]">
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="搜索工作流名称或描述"
                  />
                  <Select
                    value={statusFilter}
                    onChange={(value) => setStatusFilter(value as typeof statusFilter)}
                    options={statusOptions}
                  />
                  <Button
                    variant="outline"
                    disabled={schedules.length === 0}
                    onClick={() =>
                      setSelectedIds((current) =>
                        current.length === schedules.length ? [] : schedules.map((item) => item.id),
                      )
                    }
                  >
                    {selectedIds.length === schedules.length && schedules.length > 0 ? "取消全选" : "全选当前页"}
                  </Button>
                </div>

                <div className="space-y-4 xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:pr-1">
                  {schedules.length === 0 && !isLoading ? (
                    <div className="space-y-4 rounded-xl border border-dashed border-white/[0.08] bg-white/[0.02] p-8 text-center text-sm text-zinc-500">
                      <div>当前没有启用中的定时工作流。你可以先在工作区为某个工作流开启 Cron 调度。</div>
                      <Button variant="outline" className="gap-2" onClick={() => navigate("/")}>
                        <Workflow className="h-4 w-4" />
                        前往工作区
                      </Button>
                    </div>
                  ) : null}

                  {schedules.map((item) => {
                    const taskStatusMeta = getTaskStatusMeta(item.lastScheduledTask?.status);

                    return (
                      <div key={item.id} className="space-y-4 rounded-xl border border-white/[0.05] bg-white/[0.02] p-5">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex min-w-0 items-start gap-3">
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(item.id)}
                              onChange={() => toggleSelected(item.id)}
                              className="mt-1 h-4 w-4 rounded border-white/10 bg-zinc-900"
                            />
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="truncate text-base font-semibold text-zinc-100">{item.name}</div>
                                <div className="rounded border border-sky-500/20 bg-sky-500/10 px-2 py-1 text-[10px] font-medium text-sky-300">
                                  已启用
                                </div>
                                {item.lastScheduledTask ? (
                                  <div className={cn("rounded px-2 py-1 text-[10px] font-medium", taskStatusMeta.className)}>
                                    {taskStatusMeta.label}
                                  </div>
                                ) : null}
                              </div>
                              <div className="mt-2 text-sm text-zinc-400">{item.description || "暂无描述"}</div>
                              <div className="mt-2 break-all font-mono text-xs text-zinc-500">{item.id}</div>
                            </div>
                          </div>

                          <div className="flex shrink-0 items-center gap-2">
                            <Button variant="outline" size="sm" className="gap-2" onClick={() => navigate(`/?workflowId=${item.id}`)}>
                              <Workflow className="h-4 w-4" />
                              打开工作流
                            </Button>
                            {item.lastScheduledTask ? (
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-2"
                                onClick={() => navigate(`/monitor?taskId=${item.lastScheduledTask.id}`)}
                              >
                                <ArrowRight className="h-4 w-4" />
                                查看监控
                              </Button>
                            ) : null}
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-2 border-red-500/20 text-red-300 hover:bg-red-500/10"
                              disabled={updatingWorkflowId === item.id}
                              onClick={() => void disableSchedule(item)}
                            >
                              <PauseCircle className="h-4 w-4" />
                              {updatingWorkflowId === item.id ? "停用中..." : "停用调度"}
                            </Button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                          <InfoCell title="Cron 表达式" value={item.scheduleCron || "--"} mono />
                          <InfoCell title="下一次执行" value={formatDateTime(item.nextRunAt)} />
                          <InfoCell title="时区" value={item.scheduleTimezone || "Asia/Shanghai"} />
                        </div>

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                          <CardCell
                            icon={<Clock3 className="h-3.5 w-3.5" />}
                            title="最近一次调度任务"
                            value={item.lastScheduledTask?.id || "--"}
                            hint={`创建时间：${formatDateTime(item.lastScheduledTask?.createdAt)}`}
                            mono
                          />
                          <CardCell
                            icon={<Mail className="h-3.5 w-3.5" />}
                            title="告警邮箱"
                            value={item.alertEmail || "未配置"}
                            hint={
                              item.alertOnFailure || item.alertOnSuccess
                                ? `${item.alertOnFailure ? "失败通知" : ""}${item.alertOnFailure && item.alertOnSuccess ? " / " : ""}${item.alertOnSuccess ? "成功通知" : ""}`
                                : "邮件告警已关闭"
                            }
                          />
                          <CardCell
                            icon={<Settings2 className="h-3.5 w-3.5" />}
                            title="最近更新时间"
                            value={formatDateTime(item.updatedAt)}
                            hint="如需修改 Cron 或告警策略，请打开工作流继续调整。"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between gap-4 pt-2">
                  <div className="text-xs text-zinc-500">调度管理中心已启用分页，避免工作流过多时需要一直向下滑。</div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1 || isLoading}
                      onClick={() => setPage((value) => Math.max(1, value - 1))}
                    >
                      上一页
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages || isLoading}
                      onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                    >
                      下一页
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="mb-1 flex items-center gap-2">
                  <Settings2 className="h-5 w-5 text-zinc-300" />
                  <CardTitle>说明</CardTitle>
                </div>
                <CardDescription>这里用于统一管理调度任务，避免调度分散在多个工作流里难以排查。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-zinc-400">
                <div>1. 停用调度只会停止后续自动触发，不会删除历史任务。</div>
                <div>2. 最近一次调度任务来自真实的 `triggerSource = schedule` 执行记录。</div>
                <div>3. 下一次执行时间来自 BullMQ 调度器的 `next` 字段，可直接反映当前队列状态。</div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <Card>
                <CardHeader>
                  <div className="mb-1 flex items-center gap-2">
                    <UserRound className="h-5 w-5 text-sky-400" />
                    <CardTitle>个人资料</CardTitle>
                  </div>
                  <CardDescription>普通用户和管理员都可以在这里维护自己的显示名称。</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Input value={user?.email ?? ""} disabled placeholder="邮箱" />
                  <Input value={profileName} onChange={(event) => setProfileName(event.target.value)} placeholder="显示名称" />
                  <div className="text-xs text-zinc-500">当前角色：{user?.role === "admin" ? "管理员" : "普通用户"}</div>
                  <div className="flex justify-end">
                    <Button
                      disabled={!profileName.trim() || isSavingProfile}
                      onClick={async () => {
                        try {
                          setIsSavingProfile(true);
                          setProfileMessage("");
                          await updateCurrentUserProfile({ name: profileName.trim() });
                          await refreshUser();
                          setProfileMessage("个人资料已更新。");
                        } catch (error) {
                          setProfileMessage(error instanceof Error ? error.message : "更新个人资料失败。");
                        } finally {
                          setIsSavingProfile(false);
                        }
                      }}
                    >
                      {isSavingProfile ? "保存中..." : "保存资料"}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="mb-1 flex items-center gap-2">
                    <KeyRound className="h-5 w-5 text-amber-400" />
                    <CardTitle>账户安全</CardTitle>
                  </div>
                  <CardDescription>支持自助修改登录密码，不再依赖管理员重置。</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} placeholder="当前密码" />
                  <Input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="新密码，至少 8 位" />
                  <Input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="再次输入新密码" />
                  <div className="flex justify-end">
                    <Button
                      disabled={
                        !currentPassword.trim() ||
                        newPassword.trim().length < 8 ||
                        confirmPassword !== newPassword ||
                        isChangingPassword
                      }
                      onClick={async () => {
                        if (newPassword !== confirmPassword) {
                          setProfileMessage("两次输入的新密码不一致。");
                          return;
                        }

                        try {
                          setIsChangingPassword(true);
                          setProfileMessage("");
                          await changeCurrentUserPassword({
                            currentPassword,
                            newPassword,
                          });
                          setCurrentPassword("");
                          setNewPassword("");
                          setConfirmPassword("");
                          setProfileMessage("密码已修改成功。");
                        } catch (error) {
                          setProfileMessage(error instanceof Error ? error.message : "修改密码失败。");
                        } finally {
                          setIsChangingPassword(false);
                        }
                      }}
                    >
                      {isChangingPassword ? "提交中..." : "修改密码"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            {profileMessage ? (
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-sm text-zinc-300">
                {profileMessage}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-2 text-sm text-zinc-400">{label}</div>
        <div className={cn("text-3xl font-bold", accent)}>{value}</div>
      </CardContent>
    </Card>
  );
}

function InfoCell({ title, value, mono = false }: { title: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-white/[0.05] bg-black/20 p-4">
      <div className="mb-2 text-xs text-zinc-500">{title}</div>
      <div className={cn("text-sm text-zinc-100", mono && "break-all font-mono")}>{value}</div>
    </div>
  );
}

function CardCell({
  icon,
  title,
  value,
  hint,
  mono = false,
}: {
  icon: ReactNode;
  title: string;
  value: string;
  hint: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-lg border border-white/[0.05] bg-black/20 p-4">
      <div className="mb-2 flex items-center gap-2 text-xs text-zinc-500">
        {icon}
        {title}
      </div>
      <div className={cn("text-sm text-zinc-100", mono && "break-all font-mono")}>{value}</div>
      <div className="mt-2 text-xs text-zinc-500">{hint}</div>
    </div>
  );
}
