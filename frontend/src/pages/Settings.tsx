import { Sidebar } from "@/src/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/src/components/ui/Card";
import { Button } from "@/src/components/ui/Button";
import { Input } from "@/src/components/ui/Input";
import { Key, Globe, Shield, Database } from "lucide-react";

export default function Settings() {
  return (
    <div className="h-screen w-screen bg-[#09090b] text-zinc-50 flex overflow-hidden font-sans selection:bg-indigo-500/30">
      <div className="fixed inset-0 z-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.15),rgba(255,255,255,0))] pointer-events-none"></div>

      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 relative z-10">
        <div className="h-14 border-b border-white/[0.05] bg-zinc-950/50 backdrop-blur-md flex items-center px-6 z-10">
          <h1 className="text-sm font-medium text-zinc-100">系统设置</h1>
        </div>

        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-4xl mx-auto space-y-8">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight mb-1">全局设置</h2>
              <p className="text-sm text-zinc-400">配置第三方 API 密钥、环境变量及系统偏好。</p>
            </div>

            <div className="grid gap-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2 mb-1">
                    <Key className="w-5 h-5 text-indigo-400" />
                    <CardTitle>API 密钥配置</CardTitle>
                  </div>
                  <CardDescription>配置用于 AI 节点和外部服务的全局 API 密钥。</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-300">OpenAI API Key</label>
                    <div className="flex gap-2">
                      <Input type="password" defaultValue="sk-................................" className="font-mono" />
                      <Button variant="outline">验证</Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-300">Anthropic API Key</label>
                    <div className="flex gap-2">
                      <Input type="password" placeholder="sk-ant-..." className="font-mono" />
                      <Button variant="outline">验证</Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2 mb-1">
                    <Globe className="w-5 h-5 text-emerald-400" />
                    <CardTitle>代理与网络</CardTitle>
                  </div>
                  <CardDescription>配置云端浏览器节点的默认网络代理。</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-300">HTTP 代理地址</label>
                    <Input placeholder="http://proxy.example.com:8080" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-300">代理白名单 (按行分隔)</label>
                    <textarea 
                      className="flex min-h-[80px] w-full rounded-md border border-white/[0.06] bg-zinc-900/50 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500"
                      placeholder="*.openai.com&#10;*.github.com"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2 mb-1">
                    <Database className="w-5 h-5 text-rose-400" />
                    <CardTitle>数据保留策略</CardTitle>
                  </div>
                  <CardDescription>管理工作流执行日志和提取数据的存储期限。</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-lg border border-white/[0.05] bg-white/[0.02]">
                    <div>
                      <div className="font-medium text-zinc-200">执行日志保留时间</div>
                      <div className="text-sm text-zinc-500">超过此时间的日志将被自动清理</div>
                    </div>
                    <select className="bg-zinc-900 border border-white/[0.1] text-zinc-200 text-sm rounded-md px-3 py-1.5 outline-none focus:ring-1 focus:ring-indigo-500">
                      <option>7 天</option>
                      <option>30 天</option>
                      <option>90 天</option>
                      <option>永久保留</option>
                    </select>
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-end gap-3">
                <Button variant="ghost">取消更改</Button>
                <Button className="bg-indigo-600 hover:bg-indigo-700 text-white border-transparent">保存所有设置</Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
