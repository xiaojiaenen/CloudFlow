import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sidebar } from "@/src/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/Card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/Table";
import { Button } from "@/src/components/ui/Button";
import { Bell, AlertTriangle, CheckCircle2, Clock, RefreshCw, XCircle } from "lucide-react";
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
      className: "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20",
    };
  }

  if (level === "warning") {
    return {
      icon: AlertTriangle,
      label: "告警",
      className: "bg-amber-500/10 text-amber-300 border border-amber-500/20",
    };
  }

  return {
    icon: XCircle,
    label: "错误",
    className: "bg-red-500/10 text-red-300 border border-red-500/20",
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

  return (
    <div className="h-screen w-screen bg-[#09090b] text-zinc-50 flex overflow-hidden font-sans selection:bg-sky-500/30">
      <div className="fixed inset-0 z-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(14,165,233,0.1),rgba(255,255,255,0))] pointer-events-none" />

      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 relative z-10 overflow-hidden">
        <div className="h-14 border-b border-white/[0.05] bg-zinc-950/50 backdrop-blur-md flex items-center px-6 z-10">
          <h1 className="text-sm font-medium text-zinc-100">告警中心</h1>
        </div>

        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-6xl mx-auto space-y-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight mb-1">告警中心</h2>
                <p className="text-sm text-zinc-400">查看执行异常、取消和成功完成等关键事件，支持分页浏览。</p>
              </div>
              <Button variant="outline" onClick={() => void loadAlerts()} className="gap-2">
                <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
                刷新告警
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-5">
                  <div className="text-sm text-zinc-400 mb-2">总告警数</div>
                  <div className="text-3xl font-bold text-zinc-100">{total}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <div className="text-sm text-zinc-400 mb-2">当前页错误</div>
                  <div className="text-3xl font-bold text-red-400">{metrics.error}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <div className="text-sm text-zinc-400 mb-2">当前页告警</div>
                  <div className="text-3xl font-bold text-amber-400">{metrics.warning}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <div className="text-sm text-zinc-400 mb-2">当前页成功</div>
                  <div className="text-3xl font-bold text-emerald-400">{metrics.success}</div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <div>
                  <CardTitle>告警列表</CardTitle>
                  <div className="text-xs text-zinc-500 mt-1">
                    {isLoading ? "正在同步..." : `第 ${page} / ${totalPages} 页 · 每页 ${pageSize} 条`}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {[
                    { value: "all", label: "全部" },
                    { value: "error", label: "错误" },
                    { value: "warning", label: "告警" },
                    { value: "success", label: "成功" },
                  ].map((option) => (
                    <Button
                      key={option.value}
                      variant={levelFilter === option.value ? "default" : "outline"}
                      size="sm"
                      onClick={() => setLevelFilter(option.value as typeof levelFilter)}
                    >
                      {option.label}
                    </Button>
                  ))}
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
                    {alerts.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="py-10 text-center text-zinc-500">
                          当前条件下还没有告警记录。
                        </TableCell>
                      </TableRow>
                    )}

                    {alerts.map((alert) => {
                      const meta = getAlertMeta(alert.level);
                      const Icon = meta.icon;
                      return (
                        <TableRow key={alert.id}>
                          <TableCell>
                            <div className={cn("inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium", meta.className)}>
                              <Icon className="w-3.5 h-3.5" />
                              {meta.label}
                            </div>
                          </TableCell>
                          <TableCell className="font-medium text-zinc-200">
                            <div>{alert.workflowName}</div>
                            <div className="text-[11px] text-zinc-500 font-mono mt-1">{alert.workflowId}</div>
                          </TableCell>
                          <TableCell className="text-zinc-400">
                            {alert.triggerSource === "schedule" ? "定时触发" : "手动触发"}
                          </TableCell>
                          <TableCell className="text-zinc-300">
                            <div className="font-medium text-zinc-100">{alert.title}</div>
                            <div className="text-zinc-400 mt-1">{alert.message}</div>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-2"
                              onClick={() => navigate(`/monitor?taskId=${alert.taskId}`)}
                            >
                              <Bell className="w-4 h-4" />
                              查看任务
                            </Button>
                          </TableCell>
                          <TableCell className="text-right text-zinc-500">
                            <div className="flex items-center justify-end gap-1">
                              <Clock className="w-3 h-3" />
                              {formatDateTime(alert.createdAt)}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

                <div className="mt-6 flex items-center justify-between gap-4">
                  <div className="text-xs text-zinc-500">分页浏览已启用，不再无限向下滚动。</div>
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
