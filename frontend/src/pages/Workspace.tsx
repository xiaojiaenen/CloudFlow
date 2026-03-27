import { useState, useEffect } from "react";
import { Sidebar } from "@/src/components/Sidebar";
import { Header } from "@/src/components/Header";
import { WorkflowCanvas } from "@/src/components/WorkflowCanvas";
import { ExecutionPanel } from "@/src/components/ExecutionPanel";
import { LogEntry } from "@/src/components/LogPanel";
import { NodeConfigPanel } from "@/src/components/NodeConfigPanel";
import { NodePalette } from "@/src/components/NodePalette";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/src/components/ui/Dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/src/components/ui/Tabs";
import { Switch } from "@/src/components/ui/Switch";
import { Button } from "@/src/components/ui/Button";
import { Input } from "@/src/components/ui/Input";
import { Settings } from "lucide-react";

import { ReactFlowProvider } from "@xyflow/react";

export default function Workspace() {
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const toggleRun = () => {
    if (isRunning) {
      setIsRunning(false);
      addLog("warn", "用户已手动停止执行。");
    } else {
      setIsRunning(true);
      setSelectedNodeId(null); // Hide config panel when running
      setLogs([]);
      addLog("info", "开始执行工作流...");
      addLog("info", "正在初始化云端浏览器实例...");
    }
  };

  const addLog = (level: LogEntry["level"], message: string) => {
    setLogs((prev) => [
      ...prev,
      {
        id: Math.random().toString(36).substring(7),
        timestamp: new Date().toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        level,
        message,
      },
    ]);
  };

  useEffect(() => {
    if (!isRunning) return;

    const steps = [
      { delay: 1500, level: "success", msg: "浏览器实例启动成功。" },
      { delay: 3000, level: "info", msg: "正在导航至 https://amazon.com..." },
      { delay: 5000, level: "success", msg: "页面加载完成。" },
      { delay: 6500, level: "info", msg: "正在搜索框输入 'MacBook'..." },
      { delay: 8000, level: "info", msg: "点击搜索按钮..." },
      { delay: 10000, level: "success", msg: "搜索结果已渲染。" },
      { delay: 12000, level: "info", msg: "正在提取商品价格列表..." },
      { delay: 14000, level: "success", msg: "成功提取 24 条商品数据。" },
      { delay: 15000, level: "info", msg: "正在同步至数据库..." },
      { delay: 16000, level: "success", msg: "工作流执行完毕。" },
    ];

    const timeouts = steps.map((step) =>
      setTimeout(() => {
        addLog(step.level as LogEntry["level"], step.msg);
        if (step.msg.includes("完毕")) {
          setIsRunning(false);
        }
      }, step.delay)
    );

    return () => {
      timeouts.forEach(clearTimeout);
    };
  }, [isRunning]);

  return (
    <div className="h-screen w-screen bg-[#09090b] text-zinc-50 flex overflow-hidden font-sans selection:bg-sky-500/30">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 bg-[#09090b] relative">
        {/* Breathing Background for Workspace */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-sky-900/10 via-transparent to-transparent pointer-events-none"></div>

        <div className="flex items-center justify-between border-b border-white/[0.05] bg-zinc-950/50 backdrop-blur-md px-6 z-10">
          <Header isRunning={isRunning} onToggleRun={toggleRun} />
          <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)} className="ml-4 h-8 gap-2">
            <Settings className="w-3.5 h-3.5" />
            全局配置
          </Button>
        </div>

        <div className="flex-1 flex overflow-hidden relative">
          <ReactFlowProvider>
            <NodePalette />
            
            <WorkflowCanvas 
              isRunning={isRunning} 
              onNodeSelect={(id) => {
                if (!isRunning) setSelectedNodeId(id);
              }} 
            />
            
            <div className="h-full z-10 flex border-l border-white/[0.05]">
              {selectedNodeId && !isRunning ? (
                <NodeConfigPanel nodeId={selectedNodeId} onClose={() => setSelectedNodeId(null)} />
              ) : (
                <ExecutionPanel
                  isRunning={isRunning}
                  logs={logs}
                  onClearLogs={() => setLogs([])}
                />
              )}
            </div>
          </ReactFlowProvider>
        </div>
      </div>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogHeader>
          <DialogTitle>工作流全局配置</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <Tabs defaultValue="schedule">
            <TabsList className="w-full grid grid-cols-2 mb-6">
              <TabsTrigger value="schedule">调度执行</TabsTrigger>
              <TabsTrigger value="alerts">告警规则</TabsTrigger>
            </TabsList>
            
            <TabsContent value="schedule" className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-zinc-200">启用定时调度</div>
                  <div className="text-xs text-zinc-500">按设定的时间周期自动运行此工作流</div>
                </div>
                <Switch checked={true} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">Cron 表达式</label>
                <Input defaultValue="0 0 * * *" className="font-mono text-sm" />
                <p className="text-xs text-zinc-500">每天凌晨 00:00 执行</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">时区</label>
                <select className="flex h-10 w-full rounded-md border border-white/[0.06] bg-zinc-900/50 px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-sky-500">
                  <option value="Asia/Shanghai" className="bg-zinc-800 text-zinc-200">Asia/Shanghai (UTC+8)</option>
                  <option value="UTC" className="bg-zinc-800 text-zinc-200">UTC</option>
                </select>
              </div>
            </TabsContent>

            <TabsContent value="alerts" className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-zinc-200">执行失败 (Error)</div>
                  <div className="text-xs text-zinc-500">节点报错或超时</div>
                </div>
                <Switch checked={true} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-zinc-200">执行成功 (Success)</div>
                  <div className="text-xs text-zinc-500">工作流完整运行结束</div>
                </div>
                <Switch checked={false} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-zinc-200">执行超时 (Timeout)</div>
                  <div className="text-xs text-zinc-500">运行时间超过设定阈值</div>
                </div>
                <Switch checked={true} />
              </div>
              <div className="pt-4 border-t border-white/[0.05] space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-300">通知邮箱</label>
                  <Input placeholder="admin@example.com" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-300">Webhook URL (可选)</label>
                  <Input placeholder="https://..." />
                </div>
              </div>
            </TabsContent>
          </Tabs>
          
          <div className="mt-8 flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setSettingsOpen(false)}>取消</Button>
            <Button className="bg-sky-600 hover:bg-sky-700 text-white border-transparent" onClick={() => setSettingsOpen(false)}>保存配置</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
