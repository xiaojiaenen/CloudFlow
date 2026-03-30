import { useCallback, useEffect, useMemo, useState } from "react";
import { Sidebar } from "@/src/components/Sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/Card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/src/components/ui/Tabs";
import { Badge } from "@/src/components/ui/Badge";
import { Button } from "@/src/components/ui/Button";
import { Input } from "@/src/components/ui/Input";
import {
  createAdminTemplate,
  getAdminOverview,
  getHealthStatus,
  getSystemConfig,
  HealthRecord,
  listAdminTemplates,
  SystemConfigRecord,
  updateAdminTemplate,
  updateSystemConfig,
  WorkflowTemplateRecord,
  AdminOverviewRecord,
} from "@/src/lib/cloudflow";
import { cn } from "@/src/lib/utils";
import { Activity, Mail, RefreshCw, Server, Settings2, ShieldCheck, ShoppingBag, Users } from "lucide-react";

function HealthBadge({ value }: { value: string | boolean }) {
  const normalized = typeof value === "boolean" ? (value ? "up" : "down") : value;
  const isHealthy = normalized === "up" || normalized === "true";

  return (
    <Badge className={cn(isHealthy ? "bg-emerald-500/20 text-emerald-300 border-transparent" : "bg-red-500/20 text-red-300 border-transparent")}>
      {typeof value === "boolean" ? (value ? "已配置" : "未配置") : normalized}
    </Badge>
  );
}

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
  createdAt: "",
  updatedAt: "",
};

export default function Admin() {
  const [overview, setOverview] = useState<AdminOverviewRecord | null>(null);
  const [health, setHealth] = useState<HealthRecord | null>(null);
  const [config, setConfig] = useState<SystemConfigRecord>(emptyConfig);
  const [templates, setTemplates] = useState<WorkflowTemplateRecord[]>([]);
  const [templateSearch, setTemplateSearch] = useState("");
  const [templateFilter, setTemplateFilter] = useState<"all" | "true" | "false">("all");
  const [isLoading, setIsLoading] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [isCreatingTemplate, setIsCreatingTemplate] = useState(false);
  const [newTemplate, setNewTemplate] = useState({
    slug: "",
    title: "",
    description: "",
    category: "",
    tags: "",
    authorName: "CloudFlow 官方",
  });

  const loadAll = useCallback(async () => {
    try {
      setIsLoading(true);
      const [overviewData, healthData, configData, templateData] = await Promise.all([
        getAdminOverview(),
        getHealthStatus(),
        getSystemConfig(),
        listAdminTemplates({
          search: templateSearch,
          published: templateFilter,
        }),
      ]);
      setOverview(overviewData);
      setHealth(healthData);
      setConfig(configData);
      setTemplates(templateData);
    } finally {
      setIsLoading(false);
    }
  }, [templateFilter, templateSearch]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const templateStats = useMemo(() => {
    return {
      total: templates.length,
      published: templates.filter((item) => item.published).length,
      featured: templates.filter((item) => item.featured).length,
    };
  }, [templates]);

  return (
    <div className="h-screen w-screen bg-[#09090b] text-zinc-50 flex overflow-hidden font-sans selection:bg-indigo-500/30">
      <div className="fixed inset-0 z-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(56,189,248,0.12),rgba(255,255,255,0))] pointer-events-none" />

      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 relative z-10">
        <div className="h-14 border-b border-white/[0.05] bg-zinc-950/50 backdrop-blur-md flex items-center justify-between px-6 z-10">
          <h1 className="text-sm font-medium text-zinc-100">管理后台</h1>
          <Button variant="outline" onClick={() => void loadAll()} className="gap-2">
            <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
            刷新后台数据
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-7xl mx-auto space-y-8">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight mb-1">系统管理中心</h2>
              <p className="text-sm text-zinc-400">这里开始承接真正的平台管理能力，包括角色边界、模板商店运营、SMTP 与健康检查。</p>
            </div>

            <Tabs defaultValue="overview">
              <TabsList>
                <TabsTrigger value="overview">角色与总览</TabsTrigger>
                <TabsTrigger value="templates">模板后台</TabsTrigger>
                <TabsTrigger value="system">系统配置</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-sm text-zinc-400">活跃工作流</div>
                        <Activity className="w-4 h-4 text-sky-400" />
                      </div>
                      <div className="text-3xl font-bold text-zinc-100">{overview?.metrics.activeWorkflows ?? 0}</div>
                      <div className="text-xs text-zinc-500 mt-2">草稿 {overview?.metrics.draftWorkflows ?? 0} · 已归档 {overview?.metrics.archivedWorkflows ?? 0}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-sm text-zinc-400">商店模板</div>
                        <ShoppingBag className="w-4 h-4 text-violet-400" />
                      </div>
                      <div className="text-3xl font-bold text-zinc-100">{overview?.metrics.templateTotal ?? 0}</div>
                      <div className="text-xs text-zinc-500 mt-2">已发布 {overview?.metrics.publishedTemplates ?? 0}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-sm text-zinc-400">启用调度</div>
                        <Server className="w-4 h-4 text-emerald-400" />
                      </div>
                      <div className="text-3xl font-bold text-zinc-100">{overview?.metrics.scheduledWorkflows ?? 0}</div>
                      <div className="text-xs text-zinc-500 mt-2">用于评估自动触发规模</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-sm text-zinc-400">累计任务</div>
                        <Users className="w-4 h-4 text-amber-400" />
                      </div>
                      <div className="text-3xl font-bold text-zinc-100">{overview?.metrics.taskTotal ?? 0}</div>
                      <div className="text-xs text-zinc-500 mt-2">覆盖手动触发与定时触发</div>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>角色能力边界</CardTitle>
                    <CardDescription>当前建议采用两层角色模型，先把平台职责分清，后续再接登录鉴权与数据隔离。</CardDescription>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {overview?.roleMatrix.map((role) => (
                      <div key={role.key} className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-5 space-y-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-lg font-semibold text-zinc-100">{role.name}</div>
                            <div className="text-sm text-zinc-400 mt-1">{role.summary}</div>
                          </div>
                          <Badge variant={role.key === "admin" ? "default" : "secondary"}>
                            {role.key === "admin" ? "平台角色" : "业务角色"}
                          </Badge>
                        </div>
                        <div className="space-y-2 text-sm text-zinc-300">
                          {role.capabilities.map((item) => (
                            <div key={item} className="rounded-lg border border-white/[0.05] bg-black/20 px-3 py-2">
                              {item}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>系统健康</CardTitle>
                    <CardDescription>管理员关注的是平台是否稳定，而不是只看单个工作流是否成功。</CardDescription>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
                    <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-4 space-y-2">
                      <div className="text-xs text-zinc-500">API</div>
                      <HealthBadge value={health?.api ?? "down"} />
                    </div>
                    <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-4 space-y-2">
                      <div className="text-xs text-zinc-500">数据库</div>
                      <HealthBadge value={health?.database ?? "down"} />
                    </div>
                    <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-4 space-y-2">
                      <div className="text-xs text-zinc-500">Redis</div>
                      <HealthBadge value={health?.redis ?? "down"} />
                    </div>
                    <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-4 space-y-2">
                      <div className="text-xs text-zinc-500">SMTP</div>
                      <HealthBadge value={health?.smtpConfigured ?? false} />
                    </div>
                    <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-4 space-y-2">
                      <div className="text-xs text-zinc-500">检查时间</div>
                      <div className="text-sm text-zinc-200">{health?.checkedAt ? new Date(health.checkedAt).toLocaleString("zh-CN", { hour12: false }) : "--"}</div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="templates" className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="p-5">
                      <div className="text-sm text-zinc-400 mb-2">当前模板数</div>
                      <div className="text-3xl font-bold text-zinc-100">{templateStats.total}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-5">
                      <div className="text-sm text-zinc-400 mb-2">已发布</div>
                      <div className="text-3xl font-bold text-emerald-400">{templateStats.published}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-5">
                      <div className="text-sm text-zinc-400 mb-2">推荐位</div>
                      <div className="text-3xl font-bold text-sky-400">{templateStats.featured}</div>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>创建模板</CardTitle>
                    <CardDescription>管理员可以把成熟工作流沉淀为商店模板，供普通用户直接导入。</CardDescription>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input value={newTemplate.title} onChange={(event) => setNewTemplate((current) => ({ ...current, title: event.target.value }))} placeholder="模板标题" />
                    <Input value={newTemplate.slug} onChange={(event) => setNewTemplate((current) => ({ ...current, slug: event.target.value }))} placeholder="模板 slug，例如 daily-report" />
                    <Input value={newTemplate.category} onChange={(event) => setNewTemplate((current) => ({ ...current, category: event.target.value }))} placeholder="分类，例如 数据抓取" />
                    <Input value={newTemplate.authorName} onChange={(event) => setNewTemplate((current) => ({ ...current, authorName: event.target.value }))} placeholder="作者名称" />
                    <Input value={newTemplate.tags} onChange={(event) => setNewTemplate((current) => ({ ...current, tags: event.target.value }))} placeholder="标签，使用中文逗号分隔" className="md:col-span-2" />
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
                              definition: {
                                nodes: [],
                                canvas: {
                                  nodes: [],
                                  edges: [],
                                },
                              },
                            });
                            setNewTemplate({
                              slug: "",
                              title: "",
                              description: "",
                              category: "",
                              tags: "",
                              authorName: "CloudFlow 官方",
                            });
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
                      <select
                        value={templateFilter}
                        onChange={(event) => setTemplateFilter(event.target.value as typeof templateFilter)}
                        className="flex h-10 rounded-md border border-white/[0.06] bg-zinc-900/50 px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
                      >
                        <option value="all">全部</option>
                        <option value="true">仅已发布</option>
                        <option value="false">仅未发布</option>
                      </select>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {templates.map((template) => (
                      <div key={template.id} className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-4 flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="text-sm font-semibold text-zinc-100">{template.title}</div>
                            <Badge variant={template.published ? "success" : "secondary"}>
                              {template.published ? "已发布" : "草稿"}
                            </Badge>
                            {template.featured && <Badge variant="default">推荐</Badge>}
                          </div>
                          <div className="text-xs text-zinc-500 mt-2">
                            {template.category} · {template.authorName} · 安装 {template.installCount.toLocaleString()} 次 · 评分 {template.rating.toFixed(1)}
                          </div>
                          <div className="text-sm text-zinc-400 mt-2">{template.description}</div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              await updateAdminTemplate(template.id, {
                                published: !template.published,
                              });
                              await loadAll();
                            }}
                          >
                            {template.published ? "下架" : "发布"}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              await updateAdminTemplate(template.id, {
                                featured: !template.featured,
                              });
                              await loadAll();
                            }}
                          >
                            {template.featured ? "取消推荐" : "设为推荐"}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="system" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>系统参数</CardTitle>
                    <CardDescription>管理员配置平台级参数后，普通用户在工作区和告警里就能直接复用。</CardDescription>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input value={config.platformName} onChange={(event) => setConfig((current) => ({ ...current, platformName: event.target.value }))} placeholder="平台名称" />
                    <Input value={config.supportEmail ?? ""} onChange={(event) => setConfig((current) => ({ ...current, supportEmail: event.target.value }))} placeholder="支持邮箱" />
                    <Input value={String(config.screenshotIntervalMs)} onChange={(event) => setConfig((current) => ({ ...current, screenshotIntervalMs: Number(event.target.value) || 500 }))} placeholder="截图间隔毫秒" />
                    <Input value={String(config.taskRetentionDays)} onChange={(event) => setConfig((current) => ({ ...current, taskRetentionDays: Number(event.target.value) || 30 }))} placeholder="任务保留天数" />
                    <Input value={String(config.monitorPageSize)} onChange={(event) => setConfig((current) => ({ ...current, monitorPageSize: Number(event.target.value) || 10 }))} placeholder="监控中心分页大小" />
                    <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-4 flex items-center justify-between">
                      <div>
                        <div className="text-sm text-zinc-100">SMTP SSL/TLS</div>
                        <div className="text-xs text-zinc-500 mt-1">开启后使用安全连接发送邮件。</div>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => setConfig((current) => ({ ...current, smtpSecure: !current.smtpSecure }))}>
                        {config.smtpSecure ? "已开启" : "已关闭"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-sky-400" />
                      <CardTitle>SMTP 配置</CardTitle>
                    </div>
                    <CardDescription>邮件告警会优先读取这里的配置，未填写时再回退到环境变量。</CardDescription>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input value={config.smtpHost ?? ""} onChange={(event) => setConfig((current) => ({ ...current, smtpHost: event.target.value }))} placeholder="SMTP Host" />
                    <Input value={String(config.smtpPort)} onChange={(event) => setConfig((current) => ({ ...current, smtpPort: Number(event.target.value) || 587 }))} placeholder="SMTP Port" />
                    <Input value={config.smtpUser ?? ""} onChange={(event) => setConfig((current) => ({ ...current, smtpUser: event.target.value }))} placeholder="SMTP User" />
                    <Input value={config.smtpPass ?? ""} onChange={(event) => setConfig((current) => ({ ...current, smtpPass: event.target.value }))} placeholder="SMTP Password" />
                    <Input value={config.smtpFrom ?? ""} onChange={(event) => setConfig((current) => ({ ...current, smtpFrom: event.target.value }))} placeholder="发件人地址" className="md:col-span-2" />
                    <div className="md:col-span-2 flex justify-end">
                      <Button
                        className="gap-2"
                        disabled={isSavingConfig}
                        onClick={async () => {
                          try {
                            setIsSavingConfig(true);
                            await updateSystemConfig({
                              platformName: config.platformName,
                              supportEmail: config.supportEmail,
                              smtpHost: config.smtpHost,
                              smtpPort: config.smtpPort,
                              smtpUser: config.smtpUser,
                              smtpPass: config.smtpPass,
                              smtpSecure: config.smtpSecure,
                              smtpFrom: config.smtpFrom,
                              screenshotIntervalMs: config.screenshotIntervalMs,
                              taskRetentionDays: config.taskRetentionDays,
                              monitorPageSize: config.monitorPageSize,
                            });
                            await loadAll();
                          } finally {
                            setIsSavingConfig(false);
                          }
                        }}
                      >
                        <Settings2 className="w-4 h-4" />
                        {isSavingConfig ? "保存中..." : "保存系统配置"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      <CardTitle>运行状态细项</CardTitle>
                    </div>
                    <CardDescription>方便管理员判断队列积压和调度执行情况。</CardDescription>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-4">
                      <div className="text-sm text-zinc-100 mb-3">任务队列</div>
                      <pre className="text-xs text-zinc-300 whitespace-pre-wrap break-all font-mono">{JSON.stringify(health?.queues.tasks ?? {}, null, 2)}</pre>
                    </div>
                    <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-4">
                      <div className="text-sm text-zinc-100 mb-3">调度队列</div>
                      <pre className="text-xs text-zinc-300 whitespace-pre-wrap break-all font-mono">{JSON.stringify(health?.queues.schedulers ?? {}, null, 2)}</pre>
                    </div>
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
