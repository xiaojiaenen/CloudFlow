import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sidebar } from "@/src/components/Sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/Card";
import { Button } from "@/src/components/ui/Button";
import { Input } from "@/src/components/ui/Input";
import { ArrowRight, CalendarClock, Clock3, KeyRound, Mail, PauseCircle, RefreshCw, Settings2, UserRound, Workflow } from "lucide-react";
import { useAuth } from "@/src/context/AuthContext";
import { changeCurrentUserPassword, listWorkflowSchedules, updateCurrentUserProfile, updateWorkflow, WorkflowScheduleRecord } from "@/src/lib/cloudflow";
import { cn } from "@/src/lib/utils";

function formatDateTime(value?: string | null) {
  if (!value) {
    return "--";
  }

  return new Date(value).toLocaleString("zh-CN", {
    hour12: false,
  });
}

function getTaskStatusMeta(status?: WorkflowScheduleRecord["lastScheduledTask"] extends infer T ? T extends { status: infer S } ? S : never : never) {
  if (status === "running") {
    return {
      label: "运行中",
      className: "bg-sky-500/10 text-sky-300 border border-sky-500/20",
    };
  }

  if (status === "success") {
    return {
      label: "成功",
      className: "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20",
    };
  }

  if (status === "failed") {
    return {
      label: "失败",
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
  const [schedules, setSchedules] = useState<WorkflowScheduleRecord[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(6);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "running" | "success" | "failed" | "cancelled" | "pending" | "never">("all");
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

  return (
    <div className="h-screen w-screen bg-[#09090b] text-zinc-50 flex overflow-hidden font-sans selection:bg-sky-500/30">
      <div className="fixed inset-0 z-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(56,189,248,0.12),rgba(255,255,255,0))] pointer-events-none" />

      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 relative z-10">
        <div className="h-14 border-b border-white/[0.05] bg-zinc-950/50 backdrop-blur-md flex items-center px-6 z-10">
          <h1 className="text-sm font-medium text-zinc-100">系统设置</h1>
        </div>

        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-6xl mx-auto space-y-8">
            <div className="flex items-start justify-between gap-6">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight mb-1">调度管理中心</h2>
                <p className="text-sm text-zinc-400">集中查看所有已启用的定时工作流，支持跳转编辑和一键停用。</p>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  disabled={selectedIds.length === 0 || updatingWorkflowId === "batch"}
                  onClick={() => void disableSelectedSchedules()}
                  className="gap-2 text-amber-200 border-amber-500/20 hover:bg-amber-500/10"
                >
                  <PauseCircle className="w-4 h-4" />
                  {updatingWorkflowId === "batch" ? "批量停用中..." : `批量停用 (${selectedIds.length})`}
                </Button>
                <Button variant="outline" onClick={() => void loadSchedules()} className="gap-2">
                  <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
                  刷新调度
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-5">
                  <div className="text-sm text-zinc-400 mb-2">启用中的调度</div>
                  <div className="text-3xl font-bold text-zinc-100">{metrics.total}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <div className="text-sm text-zinc-400 mb-2">当前页已配告警</div>
                  <div className="text-3xl font-bold text-sky-400">{metrics.withAlerts}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <div className="text-sm text-zinc-400 mb-2">当前页最近成功</div>
                  <div className="text-3xl font-bold text-emerald-400">{metrics.withLastSuccess}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <div className="text-sm text-zinc-400 mb-2">当前页最近失败</div>
                  <div className="text-3xl font-bold text-red-400">{metrics.withLastFailure}</div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-2 mb-1">
                  <CalendarClock className="w-5 h-5 text-sky-400 shrink-0" />
                  <div>
                    <CardTitle>全部定时工作流</CardTitle>
                    <CardDescription>这里展示当前所有已启用调度的工作流，不需要再去各个工作流里逐个查找。</CardDescription>
                  </div>
                </div>
                <div className="text-xs text-zinc-500">
                  {isLoading ? "正在同步..." : `第 ${page} / ${totalPages} 页 · 共 ${total} 个调度`}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_180px_180px] gap-3">
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="搜索工作流名称或描述"
                  />
                  <select
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
                    className="flex h-10 w-full rounded-md border border-white/[0.06] bg-zinc-900/50 px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  >
                    <option value="all">全部状态</option>
                    <option value="never">从未执行</option>
                    <option value="running">运行中</option>
                    <option value="success">最近成功</option>
                    <option value="failed">最近失败</option>
                    <option value="cancelled">最近已取消</option>
                    <option value="pending">等待中</option>
                  </select>
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

                {schedules.length === 0 && !isLoading && (
                  <div className="rounded-xl border border-dashed border-white/[0.08] bg-white/[0.02] p-8 text-center text-sm text-zinc-500 space-y-4">
                    <div>当前没有启用中的定时工作流。你可以先在工作区里为某个工作流开启 Cron 调度。</div>
                    <Button variant="outline" className="gap-2" onClick={() => navigate("/")}>
                      <Workflow className="w-4 h-4" />
                      前往工作区
                    </Button>
                  </div>
                )}

                {schedules.map((item) => {
                  const taskStatusMeta = getTaskStatusMeta(item.lastScheduledTask?.status);
                  return (
                    <div key={item.id} className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-5 space-y-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(item.id)}
                            onChange={() => toggleSelected(item.id)}
                            className="mt-1 h-4 w-4 rounded border-white/10 bg-zinc-900"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <div className="text-base font-semibold text-zinc-100 truncate">{item.name}</div>
                              <div className="px-2 py-1 rounded text-[10px] font-medium bg-sky-500/10 text-sky-300 border border-sky-500/20">
                                启用中
                              </div>
                              {item.lastScheduledTask && (
                                <div className={cn("px-2 py-1 rounded text-[10px] font-medium", taskStatusMeta.className)}>
                                  最近执行 {taskStatusMeta.label}
                                </div>
                              )}
                            </div>
                            <div className="text-sm text-zinc-400 mt-2">{item.description || "暂无描述"}</div>
                            <div className="text-xs text-zinc-500 font-mono mt-2 break-all">{item.id}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Button variant="outline" size="sm" className="gap-2" onClick={() => navigate(`/?workflowId=${item.id}`)}>
                            <Workflow className="w-4 h-4" />
                            打开工作流
                          </Button>
                          {item.lastScheduledTask && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-2"
                              onClick={() => navigate(`/monitor?taskId=${item.lastScheduledTask?.id}`)}
                            >
                              <ArrowRight className="w-4 h-4" />
                              查看监控
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-2 text-red-300 border-red-500/20 hover:bg-red-500/10"
                            disabled={updatingWorkflowId === item.id}
                            onClick={() => void disableSchedule(item)}
                          >
                            <PauseCircle className="w-4 h-4" />
                            {updatingWorkflowId === item.id ? "停用中..." : "停用调度"}
                          </Button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="rounded-lg border border-white/[0.05] bg-black/20 p-4">
                          <div className="text-zinc-500 text-xs mb-2">Cron 表达式</div>
                          <div className="text-zinc-100 font-mono text-sm">{item.scheduleCron || "--"}</div>
                        </div>
                        <div className="rounded-lg border border-white/[0.05] bg-black/20 p-4">
                          <div className="text-zinc-500 text-xs mb-2">下一次执行</div>
                          <div className="text-zinc-100 text-sm">{formatDateTime(item.nextRunAt)}</div>
                        </div>
                        <div className="rounded-lg border border-white/[0.05] bg-black/20 p-4">
                          <div className="text-zinc-500 text-xs mb-2">时区</div>
                          <div className="text-zinc-100 text-sm">{item.scheduleTimezone || "Asia/Shanghai"}</div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="rounded-lg border border-white/[0.05] bg-black/20 p-4">
                          <div className="flex items-center gap-2 text-zinc-500 text-xs mb-2">
                            <Clock3 className="w-3.5 h-3.5" />
                            最近一次调度任务
                          </div>
                          <div className="text-zinc-100 text-sm font-mono break-all">
                            {item.lastScheduledTask?.id || "--"}
                          </div>
                          <div className="text-zinc-500 text-xs mt-2">
                            创建时间: {formatDateTime(item.lastScheduledTask?.createdAt)}
                          </div>
                        </div>
                        <div className="rounded-lg border border-white/[0.05] bg-black/20 p-4">
                          <div className="text-zinc-500 text-xs mb-2">告警邮箱</div>
                          <div className="text-zinc-100 text-sm break-all">{item.alertEmail || "未配置"}</div>
                          <div className="text-zinc-500 text-xs mt-2">
                            {item.alertOnFailure || item.alertOnSuccess
                              ? `${item.alertOnFailure ? "失败通知" : ""}${item.alertOnFailure && item.alertOnSuccess ? " / " : ""}${item.alertOnSuccess ? "成功通知" : ""}`
                              : "邮件告警已关闭"}
                          </div>
                        </div>
                        <div className="rounded-lg border border-white/[0.05] bg-black/20 p-4">
                          <div className="flex items-center gap-2 text-zinc-500 text-xs mb-2">
                            <Mail className="w-3.5 h-3.5" />
                            最近更新时间
                          </div>
                          <div className="text-zinc-100 text-sm">{formatDateTime(item.updatedAt)}</div>
                          <div className="text-zinc-500 text-xs mt-2">如需修改 Cron 或告警策略，请打开工作流调整。</div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                <div className="pt-2 flex items-center justify-between gap-4">
                  <div className="text-xs text-zinc-500">调度中心已启用分页，避免列表过长难以管理。</div>
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
                <div className="flex items-center gap-2 mb-1">
                  <Settings2 className="w-5 h-5 text-zinc-300" />
                  <CardTitle>说明</CardTitle>
                </div>
                <CardDescription>这里主要用于统一管理调度任务，避免调度分散在各个工作流里难以排查。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-zinc-400">
                <div>1. 停用调度只会停止后续自动触发，不会删除历史任务。</div>
                <div>2. 最近一次调度任务来自 `triggerSource = schedule` 的真实执行记录。</div>
                <div>3. 下一次执行时间来自 BullMQ 调度器的 `next` 字段，因此可以直接反映当前队列状态。</div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2 mb-1">
                    <UserRound className="w-5 h-5 text-sky-400" />
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
                  <div className="flex items-center gap-2 mb-1">
                    <KeyRound className="w-5 h-5 text-amber-400" />
                    <CardTitle>账户安全</CardTitle>
                  </div>
                  <CardDescription>普通用户可以自助修改登录密码，不再依赖管理员重置。</CardDescription>
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

            {profileMessage && (
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-sm text-zinc-300">
                {profileMessage}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
