import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Bell, CheckCircle2, Clock, RefreshCw, XCircle } from "lucide-react";
import { AppTopbar } from "@/src/components/AppTopbar";
import { Sidebar } from "@/src/components/Sidebar";
import { Button } from "@/src/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/Card";
import { Select } from "@/src/components/ui/Select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/Table";
import { AlertRecord, listAlerts } from "@/src/lib/cloudflow";
import { cn } from "@/src/lib/utils";

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", {
    hour12: false,
  });
}

function getAlertMeta(level: AlertRecord["level"]) {
  if (level === "success") {
    return {
      icon: CheckCircle2,
      label: "成功",
      className: "border border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
    };
  }

  if (level === "warning") {
    return {
      icon: AlertTriangle,
      label: "告警",
      className: "border border-amber-500/20 bg-amber-500/10 text-amber-300",
    };
  }

  return {
    icon: XCircle,
    label: "错误",
    className: "border border-red-500/20 bg-red-500/10 text-red-300",
  };
}

export default function Alerts() {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [levelFilter, setLevelFilter] = useState<AlertRecord["level"] | "all">("all");
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  const loadAlerts = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await listAlerts({
        page,
        pageSize,
        level: levelFilter === "all" ? undefined : levelFilter,
      });
      setAlerts(data.items);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } finally {
      setIsLoading(false);
    }
  }, [levelFilter, page, pageSize]);

  useEffect(() => {
    void loadAlerts();
  }, [loadAlerts]);

  useEffect(() => {
    setPage(1);
  }, [levelFilter]);

  const metrics = useMemo(() => {
    const error = alerts.filter((item) => item.level === "error").length;
    const warning = alerts.filter((item) => item.level === "warning").length;
    const success = alerts.filter((item) => item.level === "success").length;

    return { error, warning, success };
  }, [alerts]);

  const levelOptions = [
    {
      value: "all",
      label: "全部级别",
      description: "查看所有告警记录",
      icon: <Bell className="h-3.5 w-3.5" />,
      group: "告警筛选",
    },
    {
      value: "error",
      label: "错误",
      description: "仅显示错误级别",
      icon: <XCircle className="h-3.5 w-3.5" />,
      tone: "danger" as const,
      group: "告警筛选",
    },
    {
      value: "warning",
      label: "告警",
      description: "仅显示告警级别",
      icon: <AlertTriangle className="h-3.5 w-3.5" />,
      group: "告警筛选",
    },
    {
      value: "success",
      label: "成功",
      description: "仅显示成功通知",
      icon: <CheckCircle2 className="h-3.5 w-3.5" />,
      group: "告警筛选",
    },
  ];

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#09090b] font-sans text-zinc-50 selection:bg-sky-500/30">
      <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(14,165,233,0.1),rgba(255,255,255,0))]" />
      <Sidebar />
      <div className="relative z-10 flex min-w-0 flex-1 flex-col overflow-hidden">
        <AppTopbar
          title="告警列表"
          subtitle="查看执行异常、取消与成功完成等关键事件，支持按级别筛选和分页浏览。"
          badge="Alerts"
          actions={
            <Button variant="outline" onClick={() => void loadAlerts()} className="gap-2">
              <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
              刷新告警
            </Button>
          }
        />

        <div className="flex-1 overflow-y-auto p-8">
          <div className="mx-auto max-w-6xl space-y-8">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <MetricCard label="告警总数" value={total} className="text-zinc-100" />
              <MetricCard label="当前页错误" value={metrics.error} className="text-red-400" />
              <MetricCard label="当前页告警" value={metrics.warning} className="text-amber-400" />
              <MetricCard label="当前页成功" value={metrics.success} className="text-emerald-400" />
            </div>

            <Card>
              <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <CardTitle>告警事件</CardTitle>
                  <div className="mt-1 text-xs text-zinc-500">
                    {isLoading ? "正在同步..." : `第 ${page} / ${totalPages} 页 · 每页 ${pageSize} 条`}
                  </div>
                </div>
                <div className="w-full max-w-[260px]">
                  <Select
                    value={levelFilter}
                    onChange={(value) => setLevelFilter(value as typeof levelFilter)}
                    options={levelOptions}
                  />
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>级别</TableHead>
                      <TableHead>工作流</TableHead>
                      <TableHead>触发来源</TableHead>
                      <TableHead>告警内容</TableHead>
                      <TableHead>任务详情</TableHead>
                      <TableHead className="text-right">时间</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {alerts.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-10 text-center text-zinc-500">
                          当前条件下还没有告警记录。
                        </TableCell>
                      </TableRow>
                    ) : null}

                    {alerts.map((alert) => {
                      const meta = getAlertMeta(alert.level);
                      const Icon = meta.icon;

                      return (
                        <TableRow key={alert.id}>
                          <TableCell>
                            <div className={cn("inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium", meta.className)}>
                              <Icon className="h-3.5 w-3.5" />
                              {meta.label}
                            </div>
                          </TableCell>
                          <TableCell className="font-medium text-zinc-200">
                            <div>{alert.workflowName}</div>
                            <div className="mt-1 font-mono text-[11px] text-zinc-500">{alert.workflowId}</div>
                          </TableCell>
                          <TableCell className="text-zinc-400">
                            {alert.triggerSource === "schedule" ? "定时触发" : "手动触发"}
                          </TableCell>
                          <TableCell className="text-zinc-300">
                            <div className="font-medium text-zinc-100">{alert.title}</div>
                            <div className="mt-1 text-zinc-400">{alert.message}</div>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-2"
                              onClick={() => navigate(`/monitor?taskId=${alert.taskId}`)}
                            >
                              <Bell className="h-4 w-4" />
                              查看任务
                            </Button>
                          </TableCell>
                          <TableCell className="text-right text-zinc-500">
                            <div className="flex items-center justify-end gap-1">
                              <Clock className="h-3 w-3" />
                              {formatDateTime(alert.createdAt)}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

                <div className="mt-6 flex items-center justify-between gap-4">
                  <div className="text-xs text-zinc-500">这里同样启用了分页，避免告警过多时无限下滑。</div>
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
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-2 text-sm text-zinc-400">{label}</div>
        <div className={cn("text-3xl font-bold", className)}>{value}</div>
      </CardContent>
    </Card>
  );
}
