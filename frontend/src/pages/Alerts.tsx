import { Sidebar } from "@/src/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/Card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/Table";
import { Button } from "@/src/components/ui/Button";
import { Bell, AlertTriangle, CheckCircle2, XCircle, Clock } from "lucide-react";

const alertsList = [
  { id: "1", workflow: "亚马逊商品监控", type: "Error", message: "节点 [提取商品价格] 执行超时", time: "10分钟前" },
  { id: "2", workflow: "Twitter 自动发推", type: "Warning", message: "API 速率限制即将到达", time: "1小时前" },
  { id: "3", workflow: "竞品价格监控", type: "Success", message: "成功完成 150 个页面的抓取", time: "2小时前" },
  { id: "4", workflow: "每日新闻摘要", type: "Error", message: "无法连接到目标服务器", time: "昨天" },
];

export default function Alerts() {
  return (
    <div className="h-screen w-screen bg-[#09090b] text-zinc-50 flex overflow-hidden font-sans selection:bg-sky-500/30">
      <div className="fixed inset-0 z-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(14,165,233,0.1),rgba(255,255,255,0))] pointer-events-none"></div>

      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 relative z-10">
        <div className="h-14 border-b border-white/[0.05] bg-zinc-950/50 backdrop-blur-md flex items-center px-6 z-10">
          <h1 className="text-sm font-medium text-zinc-100">告警中心</h1>
        </div>

        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-5xl mx-auto space-y-8">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight mb-1">告警中心</h2>
                <p className="text-sm text-zinc-400">查看所有工作流的近期系统告警记录。</p>
              </div>
              <Button className="gap-2 bg-sky-600 hover:bg-sky-700 text-white border-transparent">
                <Bell className="w-4 h-4" />
                标记全部已读
              </Button>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>近期告警</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>级别</TableHead>
                      <TableHead>工作流</TableHead>
                      <TableHead>告警内容</TableHead>
                      <TableHead className="text-right">时间</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {alertsList.map((alert) => (
                      <TableRow key={alert.id}>
                        <TableCell>
                          {alert.type === "Error" && <XCircle className="w-4 h-4 text-red-400" />}
                          {alert.type === "Warning" && <AlertTriangle className="w-4 h-4 text-amber-400" />}
                          {alert.type === "Success" && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                        </TableCell>
                        <TableCell className="font-medium text-zinc-200">{alert.workflow}</TableCell>
                        <TableCell className="text-zinc-400">{alert.message}</TableCell>
                        <TableCell className="text-right text-zinc-500 flex items-center justify-end gap-1">
                          <Clock className="w-3 h-3" />
                          {alert.time}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
