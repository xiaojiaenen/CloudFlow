import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Sidebar } from "@/src/components/Sidebar";
import { Badge } from "@/src/components/ui/Badge";
import { Button } from "@/src/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/Card";
import { Input } from "@/src/components/ui/Input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/src/components/ui/Tabs";
import {
  AdminOverviewRecord,
  createAdminTemplate,
  createAdminUser,
  getAdminOverview,
  getHealthStatus,
  getSystemConfig,
  HealthRecord,
  listAdminTemplates,
  listUsers,
  resetAdminUserPassword,
  ResetUserPasswordResult,
  SystemConfigRecord,
  updateAdminTemplate,
  updateAdminUser,
  updateSystemConfig,
  UserRecord,
  WorkflowTemplateRecord,
} from "@/src/lib/cloudflow";
import { cn } from "@/src/lib/utils";
import { Activity, Mail, RefreshCw, Server, Settings2, ShieldCheck, ShoppingBag, Users } from "lucide-react";

const emptyConfig: SystemConfigRecord = {
  id: "",
  platformName: "CloudFlow",
  supportEmail: "",
  smtpHost: "",
  smtpPort: 587,
  smtpUser: "",
  smtpPass: "",
  smtpSecure: false,
  smtpFrom: "",
  screenshotIntervalMs: 500,
  taskRetentionDays: 30,
  monitorPageSize: 10,
  globalTaskConcurrency: 2,
  perUserTaskConcurrency: 1,
  manualTaskPriority: 1,
  scheduledTaskPriority: 10,
  createdAt: "",
  updatedAt: "",
};

function HealthBadge({ value }: { value: string | boolean }) {
  const normalized = typeof value === "boolean" ? (value ? "up" : "down") : value;
  const isHealthy = normalized === "up" || normalized === "true";

  return (
    <Badge className={cn(isHealthy ? "bg-emerald-500/20 text-emerald-300 border-transparent" : "bg-red-500/20 text-red-300 border-transparent")}>
      {typeof value === "boolean" ? (value ? "已配置" : "未配置") : normalized}
    </Badge>
  );
}

export default function Admin() {
  const [overview, setOverview] = useState<AdminOverviewRecord | null>(null);
  const [health, setHealth] = useState<HealthRecord | null>(null);
  const [config, setConfig] = useState<SystemConfigRecord>(emptyConfig);
  const [templates, setTemplates] = useState<WorkflowTemplateRecord[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [templateSearch, setTemplateSearch] = useState("");
  const [templateFilter, setTemplateFilter] = useState<"all" | "true" | "false">("all");
  const [isLoading, setIsLoading] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [isCreatingTemplate, setIsCreatingTemplate] = useState(false);
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [resetPasswordResult, setResetPasswordResult] = useState<ResetUserPasswordResult | null>(null);
  const [newTemplate, setNewTemplate] = useState({ slug: "", title: "", description: "", category: "", tags: "", authorName: "CloudFlow 官方" });
  const [newUser, setNewUser] = useState({ email: "", name: "", role: "user" as "admin" | "user", password: "" });

  const loadAll = useCallback(async () => {
    try {
      setIsLoading(true);
      const [overviewData, healthData, configData, templateData, userData] = await Promise.all([
        getAdminOverview(),
        getHealthStatus(),
        getSystemConfig(),
        listAdminTemplates({ search: templateSearch, published: templateFilter }),
        listUsers(),
      ]);
      setOverview(overviewData);
      setHealth(healthData);
      setConfig(configData);
      setTemplates(templateData);
      setUsers(userData);
    } finally {
      setIsLoading(false);
    }
  }, [templateFilter, templateSearch]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const templateStats = useMemo(() => ({
    total: templates.length,
    published: templates.filter((item) => item.published).length,
    featured: templates.filter((item) => item.featured).length,
  }), [templates]);

  return (
    <div className="h-screen w-screen bg-[#09090b] text-zinc-50 flex overflow-hidden font-sans selection:bg-indigo-500/30">
      <div className="fixed inset-0 z-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(56,189,248,0.12),rgba(255,255,255,0))] pointer-events-none" />
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 relative z-10">
        <div className="h-14 border-b border-white/[0.05] bg-zinc-950/50 backdrop-blur-md flex items-center justify-between px-6">
          <h1 className="text-sm font-medium text-zinc-100">管理后台</h1>
          <Button variant="outline" onClick={() => void loadAll()} className="gap-2">
            <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
            刷新后台数据
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 xl:p-8">
          <div className="max-w-7xl mx-auto space-y-8">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight mb-1">系统管理中心</h2>
              <p className="text-sm text-zinc-400">这里承接平台级能力，包括用户管理、模板运营、SMTP 配置与健康检查。</p>
            </div>

            {resetPasswordResult && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                {resetPasswordResult.email} 的临时密码：<span className="font-mono">{resetPasswordResult.temporaryPassword}</span>
              </div>
            )}

            <Tabs defaultValue="overview">
              <TabsList className="sticky top-0 z-10 w-fit backdrop-blur-md">
                <TabsTrigger value="overview">角色与总览</TabsTrigger>
                <TabsTrigger value="templates">模板后台</TabsTrigger>
                <TabsTrigger value="system">系统配置</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-6 xl:max-h-[calc(100vh-14rem)] xl:overflow-y-auto xl:pr-1">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
                  <MetricCard label="活跃工作流" value={overview?.metrics.activeWorkflows ?? 0} desc={`草稿 ${overview?.metrics.draftWorkflows ?? 0} · 归档 ${overview?.metrics.archivedWorkflows ?? 0}`} icon={<Activity className="w-4 h-4 text-sky-400" />} />
                  <MetricCard label="商店模板" value={overview?.metrics.templateTotal ?? 0} desc={`已发布 ${overview?.metrics.publishedTemplates ?? 0}`} icon={<ShoppingBag className="w-4 h-4 text-violet-400" />} />
                  <MetricCard label="启用调度" value={overview?.metrics.scheduledWorkflows ?? 0} desc="用于评估自动触发规模" icon={<Server className="w-4 h-4 text-emerald-400" />} />
                  <MetricCard label="累计任务" value={overview?.metrics.taskTotal ?? 0} desc="覆盖手动触发与定时触发" icon={<Activity className="w-4 h-4 text-amber-400" />} />
                  <MetricCard label="用户总数" value={overview?.metrics.totalUsers ?? 0} desc="支持普通用户与管理员双角色" icon={<Users className="w-4 h-4 text-fuchsia-400" />} />
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>角色能力边界</CardTitle>
                    <CardDescription>管理员负责平台治理，普通用户专注自己的工作流与任务。</CardDescription>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {overview?.roleMatrix.map((role) => (
                      <div key={role.key} className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-5 space-y-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-lg font-semibold text-zinc-100">{role.name}</div>
                            <div className="text-sm text-zinc-400 mt-1">{role.summary}</div>
                          </div>
                          <Badge variant={role.key === "admin" ? "default" : "secondary"}>{role.key === "admin" ? "平台角色" : "业务角色"}</Badge>
                        </div>
                        <div className="space-y-2 text-sm text-zinc-300">
                          {role.capabilities.map((item) => <div key={item} className="rounded-lg border border-white/[0.05] bg-black/20 px-3 py-2">{item}</div>)}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>用户管理</CardTitle>
                    <CardDescription>支持创建用户、切换角色、停用账号和重置密码。</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <Input value={newUser.name} onChange={(event) => setNewUser((current) => ({ ...current, name: event.target.value }))} placeholder="用户名称" />
                      <Input value={newUser.email} onChange={(event) => setNewUser((current) => ({ ...current, email: event.target.value }))} placeholder="邮箱地址" />
                      <select value={newUser.role} onChange={(event) => setNewUser((current) => ({ ...current, role: event.target.value as "admin" | "user" }))} className="flex h-10 rounded-md border border-white/[0.06] bg-zinc-900/50 px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-sky-500">
                        <option value="user">普通用户</option>
                        <option value="admin">管理员</option>
                      </select>
                      <Input value={newUser.password} onChange={(event) => setNewUser((current) => ({ ...current, password: event.target.value }))} placeholder="初始密码，至少 8 位" type="password" />
                    </div>
                    <div className="flex justify-end">
                      <Button
                        disabled={isCreatingUser || !newUser.name.trim() || !newUser.email.trim() || newUser.password.trim().length < 8}
                        onClick={async () => {
                          try {
                            setIsCreatingUser(true);
                            await createAdminUser({ name: newUser.name.trim(), email: newUser.email.trim(), role: newUser.role, password: newUser.password });
                            setNewUser({ email: "", name: "", role: "user", password: "" });
                            await loadAll();
                          } finally {
                            setIsCreatingUser(false);
                          }
                        }}
                      >
                        {isCreatingUser ? "创建中..." : "创建用户"}
                      </Button>
                    </div>
                    <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
                      {users.map((user) => (
                        <div key={user.id} className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-4 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
                          <div>
                            <div className="text-sm font-semibold text-zinc-100">{user.name}</div>
                            <div className="text-xs text-zinc-500 mt-1">{user.email}</div>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant={user.role === "admin" ? "default" : "secondary"}>{user.role === "admin" ? "管理员" : "普通用户"}</Badge>
                            <Badge variant={user.status === "active" ? "success" : "outline"}>{user.status === "active" ? "启用中" : "已停用"}</Badge>
                            <Button variant="outline" size="sm" disabled={activeUserId === user.id} onClick={async () => { try { setActiveUserId(user.id); await updateAdminUser(user.id, { role: user.role === "admin" ? "user" : "admin" }); await loadAll(); } finally { setActiveUserId(null); } }}>
                              {user.role === "admin" ? "设为普通用户" : "设为管理员"}
                            </Button>
                            <Button variant="outline" size="sm" disabled={activeUserId === user.id} onClick={async () => { try { setActiveUserId(user.id); await updateAdminUser(user.id, { status: user.status === "active" ? "suspended" : "active" }); await loadAll(); } finally { setActiveUserId(null); } }}>
                              {user.status === "active" ? "停用用户" : "恢复启用"}
                            </Button>
                            <Button variant="outline" size="sm" disabled={activeUserId === user.id} onClick={async () => { try { setActiveUserId(user.id); setResetPasswordResult(await resetAdminUserPassword(user.id)); } finally { setActiveUserId(null); } }}>
                              重置密码
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>系统健康</CardTitle>
                    <CardDescription>帮助管理员快速判断平台依赖是否正常、队列是否堆积。</CardDescription>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
                    <HealthCell label="API" value={health?.api ?? "down"} />
                    <HealthCell label="数据库" value={health?.database ?? "down"} />
                    <HealthCell label="Redis" value={health?.redis ?? "down"} />
                    <HealthCell label="SMTP" value={health?.smtpConfigured ?? false} />
                    <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-4 space-y-2"><div className="text-xs text-zinc-500">检查时间</div><div className="text-sm text-zinc-200">{health?.checkedAt ? new Date(health.checkedAt).toLocaleString("zh-CN", { hour12: false }) : "--"}</div></div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="templates" className="space-y-6 xl:max-h-[calc(100vh-14rem)] xl:overflow-y-auto xl:pr-1">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <MetricCard label="当前模板数" value={templateStats.total} desc="" icon={<ShoppingBag className="w-4 h-4 text-zinc-400" />} />
                  <MetricCard label="已发布" value={templateStats.published} desc="" icon={<ShoppingBag className="w-4 h-4 text-emerald-400" />} />
                  <MetricCard label="推荐位" value={templateStats.featured} desc="" icon={<ShoppingBag className="w-4 h-4 text-sky-400" />} />
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>创建模板</CardTitle>
                    <CardDescription>管理员可以直接创建模板草稿，也可以在工作区把现有工作流一键发布为模板。</CardDescription>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input value={newTemplate.title} onChange={(event) => setNewTemplate((current) => ({ ...current, title: event.target.value }))} placeholder="模板标题" />
                    <Input value={newTemplate.slug} onChange={(event) => setNewTemplate((current) => ({ ...current, slug: event.target.value }))} placeholder="模板 slug，例如 daily-report" />
                    <Input value={newTemplate.category} onChange={(event) => setNewTemplate((current) => ({ ...current, category: event.target.value }))} placeholder="分类，例如 数据抓取" />
                    <Input value={newTemplate.authorName} onChange={(event) => setNewTemplate((current) => ({ ...current, authorName: event.target.value }))} placeholder="作者名称" />
                    <Input value={newTemplate.tags} onChange={(event) => setNewTemplate((current) => ({ ...current, tags: event.target.value }))} placeholder="标签，使用中英文逗号分隔" className="md:col-span-2" />
                    <Input value={newTemplate.description} onChange={(event) => setNewTemplate((current) => ({ ...current, description: event.target.value }))} placeholder="模板描述" className="md:col-span-2" />
                    <div className="md:col-span-2 flex justify-end">
                      <Button
                        disabled={!newTemplate.title.trim() || !newTemplate.slug.trim() || !newTemplate.category.trim() || isCreatingTemplate}
                        onClick={async () => {
                          try {
                            setIsCreatingTemplate(true);
                            await createAdminTemplate({
                              slug: newTemplate.slug.trim(),
                              title: newTemplate.title.trim(),
                              description: newTemplate.description.trim() || "由管理员创建的模板",
                              category: newTemplate.category.trim(),
                              tags: newTemplate.tags.split(/[，,]/).map((item) => item.trim()).filter(Boolean),
                              authorName: newTemplate.authorName.trim() || "CloudFlow 官方",
                              published: false,
                              featured: false,
                              definition: { nodes: [], canvas: { nodes: [], edges: [] } },
                            });
                            setNewTemplate({ slug: "", title: "", description: "", category: "", tags: "", authorName: "CloudFlow 官方" });
                            await loadAll();
                          } finally {
                            setIsCreatingTemplate(false);
                          }
                        }}
                      >
                        {isCreatingTemplate ? "创建中..." : "创建模板草稿"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between gap-4">
                    <div>
                      <CardTitle>模板运营列表</CardTitle>
                      <CardDescription>支持搜索、发布、下架和推荐位切换。</CardDescription>
                    </div>
                    <div className="flex items-center gap-3">
                      <Input value={templateSearch} onChange={(event) => setTemplateSearch(event.target.value)} placeholder="搜索模板标题、描述、分类" className="w-72" />
                      <select value={templateFilter} onChange={(event) => setTemplateFilter(event.target.value as typeof templateFilter)} className="flex h-10 rounded-md border border-white/[0.06] bg-zinc-900/50 px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-sky-500">
                        <option value="all">全部</option><option value="true">仅已发布</option><option value="false">仅未发布</option>
                      </select>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                    {templates.map((template) => (
                      <div key={template.id} className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-4 flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="text-sm font-semibold text-zinc-100">{template.title}</div>
                            <Badge variant={template.published ? "success" : "secondary"}>{template.published ? "已发布" : "草稿"}</Badge>
                            {template.featured && <Badge variant="default">推荐</Badge>}
                          </div>
                          <div className="text-xs text-zinc-500 mt-2">{template.category} · {template.authorName} · 安装 {template.installCount.toLocaleString()} 次 · 评分 {template.rating.toFixed(1)}</div>
                          <div className="text-sm text-zinc-400 mt-2">{template.description}</div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Button variant="outline" size="sm" onClick={async () => { await updateAdminTemplate(template.id, { published: !template.published }); await loadAll(); }}>
                            {template.published ? "下架" : "发布"}
                          </Button>
                          <Button variant="outline" size="sm" onClick={async () => { await updateAdminTemplate(template.id, { featured: !template.featured }); await loadAll(); }}>
                            {template.featured ? "取消推荐" : "设为推荐"}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="system" className="space-y-6 xl:max-h-[calc(100vh-14rem)] xl:overflow-y-auto xl:pr-1">
                <Card>
                  <CardHeader><CardTitle>系统参数</CardTitle><CardDescription>平台级参数会影响截图频率、监控分页和通知行为。</CardDescription></CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input value={config.platformName} onChange={(event) => setConfig((current) => ({ ...current, platformName: event.target.value }))} placeholder="平台名称" />
                    <Input value={config.supportEmail ?? ""} onChange={(event) => setConfig((current) => ({ ...current, supportEmail: event.target.value }))} placeholder="支持邮箱" />
                    <Input value={String(config.screenshotIntervalMs)} onChange={(event) => setConfig((current) => ({ ...current, screenshotIntervalMs: Number(event.target.value) || 500 }))} placeholder="截图间隔毫秒" />
                    <Input value={String(config.taskRetentionDays)} onChange={(event) => setConfig((current) => ({ ...current, taskRetentionDays: Number(event.target.value) || 30 }))} placeholder="任务保留天数" />
                    <Input value={String(config.monitorPageSize)} onChange={(event) => setConfig((current) => ({ ...current, monitorPageSize: Number(event.target.value) || 10 }))} placeholder="监控中心分页大小" />
                    <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-4 flex items-center justify-between"><div><div className="text-sm text-zinc-100">SMTP SSL/TLS</div><div className="text-xs text-zinc-500 mt-1">开启后使用安全连接发送邮件。</div></div><Button variant="outline" size="sm" onClick={() => setConfig((current) => ({ ...current, smtpSecure: !current.smtpSecure }))}>{config.smtpSecure ? "已开启" : "已关闭"}</Button></div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><div className="flex items-center gap-2"><Mail className="w-4 h-4 text-sky-400" /><CardTitle>SMTP 配置</CardTitle></div><CardDescription>邮件告警优先读取这里的配置，没有时再回退到环境变量。</CardDescription></CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input value={config.smtpHost ?? ""} onChange={(event) => setConfig((current) => ({ ...current, smtpHost: event.target.value }))} placeholder="SMTP Host" />
                    <Input value={String(config.smtpPort)} onChange={(event) => setConfig((current) => ({ ...current, smtpPort: Number(event.target.value) || 587 }))} placeholder="SMTP Port" />
                    <Input value={config.smtpUser ?? ""} onChange={(event) => setConfig((current) => ({ ...current, smtpUser: event.target.value }))} placeholder="SMTP User" />
                    <Input value={config.smtpPass ?? ""} onChange={(event) => setConfig((current) => ({ ...current, smtpPass: event.target.value }))} placeholder="SMTP Password" />
                    <Input value={config.smtpFrom ?? ""} onChange={(event) => setConfig((current) => ({ ...current, smtpFrom: event.target.value }))} placeholder="发件人地址" className="md:col-span-2" />
                    <div className="md:col-span-2 flex justify-end">
                      <Button className="gap-2" disabled={isSavingConfig} onClick={async () => { try { setIsSavingConfig(true); await updateSystemConfig({ platformName: config.platformName, supportEmail: config.supportEmail, smtpHost: config.smtpHost, smtpPort: config.smtpPort, smtpUser: config.smtpUser, smtpPass: config.smtpPass, smtpSecure: config.smtpSecure, smtpFrom: config.smtpFrom, screenshotIntervalMs: config.screenshotIntervalMs, taskRetentionDays: config.taskRetentionDays, monitorPageSize: config.monitorPageSize }); await loadAll(); } finally { setIsSavingConfig(false); } }}>
                        <Settings2 className="w-4 h-4" />
                        {isSavingConfig ? "保存中..." : "保存系统配置"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><div className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-emerald-400" /><CardTitle>运行状态细项</CardTitle></div><CardDescription>方便管理员判断队列积压和调度执行情况。</CardDescription></CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <QueueCard title="任务队列" data={health?.queues.tasks ?? {}} />
                    <QueueCard title="调度队列" data={health?.queues.schedulers ?? {}} />
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, desc, icon }: { label: string; value: number; desc: string; icon: ReactNode }) {
  return (
    <Card><CardContent className="p-5"><div className="flex items-center justify-between mb-2"><div className="text-sm text-zinc-400">{label}</div>{icon}</div><div className="text-3xl font-bold text-zinc-100">{value}</div>{desc ? <div className="text-xs text-zinc-500 mt-2">{desc}</div> : null}</CardContent></Card>
  );
}

function HealthCell({ label, value }: { label: string; value: string | boolean }) {
  return <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-4 space-y-2"><div className="text-xs text-zinc-500">{label}</div><HealthBadge value={value} /></div>;
}

function QueueCard({ title, data }: { title: string; data: Record<string, number> }) {
  return <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-4"><div className="text-sm text-zinc-100 mb-3">{title}</div><pre className="text-xs text-zinc-300 whitespace-pre-wrap break-all font-mono">{JSON.stringify(data, null, 2)}</pre></div>;
}
