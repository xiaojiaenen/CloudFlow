import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppTopbar } from "@/src/components/AppTopbar";
import { InitialAvatar } from "@/src/components/InitialAvatar";
import { Sidebar } from "@/src/components/Sidebar";
import { Badge } from "@/src/components/ui/Badge";
import { Button } from "@/src/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/Card";
import { Input } from "@/src/components/ui/Input";
import { Select } from "@/src/components/ui/Select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/src/components/ui/Tabs";
import { useAuth } from "@/src/context/AuthContext";
import { useNotice } from "@/src/context/NoticeContext";
import { useOverlayDialog } from "@/src/context/OverlayDialogContext";
import { useDebouncedValue } from "@/src/hooks/useDebouncedValue";
import {
  AdminOverviewRecord,
  CreatedUserResult,
  createAdminTemplate,
  createAdminUser,
  getAdminOverview,
  getHealthStatus,
  getSystemConfig,
  HealthRecord,
  listAdminTemplates,
  listUsers,
  MinioTestResult,
  resetAdminUserPassword,
  ResetUserPasswordResult,
  SmtpTestResult,
  SystemConfigRecord,
  testSystemMinioConnection,
  testSystemSmtpConnection,
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
  smtpIgnoreTlsCertificate: false,
  smtpFrom: "",
  minioEndpoint: "",
  minioPort: 9000,
  minioUseSSL: false,
  minioAccessKey: "",
  minioSecretKey: "",
  minioBucket: "cloudflow-task-artifacts",
  screenshotIntervalMs: 500,
  screenshotPersistIntervalMs: 3000,
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
  const { user } = useAuth();
  const { notify } = useNotice();
  const { confirm } = useOverlayDialog();
  const [overview, setOverview] = useState<AdminOverviewRecord | null>(null);
  const [health, setHealth] = useState<HealthRecord | null>(null);
  const [config, setConfig] = useState<SystemConfigRecord>(emptyConfig);
  const [templates, setTemplates] = useState<WorkflowTemplateRecord[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [templateSearch, setTemplateSearch] = useState("");
  const [templateFilter, setTemplateFilter] = useState<"all" | "true" | "false">("all");
  const [activeTab, setActiveTab] = useState("overview");
  const [isLoadingOverview, setIsLoadingOverview] = useState(false);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [isLoadingSystem, setIsLoadingSystem] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [isTestingSmtp, setIsTestingSmtp] = useState(false);
  const [minioTestMode, setMinioTestMode] = useState<"connection" | "bucket" | null>(null);
  const [isCreatingTemplate, setIsCreatingTemplate] = useState(false);
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [createdUserResult, setCreatedUserResult] = useState<CreatedUserResult | null>(null);
  const [resetPasswordResult, setResetPasswordResult] = useState<ResetUserPasswordResult | null>(null);
  const [smtpTestResult, setSmtpTestResult] = useState<SmtpTestResult | null>(null);
  const [smtpTestError, setSmtpTestError] = useState<string | null>(null);
  const [minioTestResult, setMinioTestResult] = useState<MinioTestResult | null>(null);
  const [minioTestError, setMinioTestError] = useState<string | null>(null);
  const [newTemplate, setNewTemplate] = useState({ slug: "", title: "", description: "", category: "", tags: "", authorName: "CloudFlow 官方" });
  const [newUser, setNewUser] = useState({ email: "", name: "", role: "user" as "admin" | "user", password: "" });
  const debouncedTemplateSearch = useDebouncedValue(templateSearch, 350);

  const loadOverviewSection = useCallback(async () => {
    try {
      setIsLoadingOverview(true);
      const [overviewData, healthData, userData] = await Promise.all([
        getAdminOverview(),
        getHealthStatus(),
        listUsers(),
      ]);
      setOverview(overviewData);
      setHealth(healthData);
      setUsers(userData);
    } catch (error) {
      notify({
        tone: "error",
        title: "加载管理总览失败",
        description: error instanceof Error ? error.message : "请稍后重试。",
      });
    } finally {
      setIsLoadingOverview(false);
    }
  }, [notify]);

  const loadTemplateSection = useCallback(async () => {
    try {
      setIsLoadingTemplates(true);
      const templateData = await listAdminTemplates({
        search: debouncedTemplateSearch,
        published: templateFilter,
      });
      setTemplates(templateData);
    } catch (error) {
      notify({
        tone: "error",
        title: "加载模板列表失败",
        description: error instanceof Error ? error.message : "请稍后重试。",
      });
    } finally {
      setIsLoadingTemplates(false);
    }
  }, [debouncedTemplateSearch, notify, templateFilter]);

  const loadSystemSection = useCallback(async () => {
    try {
      setIsLoadingSystem(true);
      const [configData, healthData] = await Promise.all([
        getSystemConfig(),
        getHealthStatus(),
      ]);
      setConfig(configData);
      setHealth(healthData);
    } catch (error) {
      notify({
        tone: "error",
        title: "加载系统配置失败",
        description: error instanceof Error ? error.message : "请稍后重试。",
      });
    } finally {
      setIsLoadingSystem(false);
    }
  }, [notify]);

  const loadActiveTab = useCallback(async () => {
    if (activeTab === "overview") {
      await loadOverviewSection();
      return;
    }

    if (activeTab === "templates") {
      await loadTemplateSection();
      return;
    }

    await loadSystemSection();
  }, [activeTab, loadOverviewSection, loadSystemSection, loadTemplateSection]);

  useEffect(() => {
    void loadOverviewSection();
  }, [loadOverviewSection]);

  useEffect(() => {
    if (activeTab === "templates") {
      void loadTemplateSection();
    }
  }, [activeTab, loadTemplateSection]);

  useEffect(() => {
    if (activeTab === "system") {
      void loadSystemSection();
    }
  }, [activeTab, loadSystemSection]);

  const isLoading = isLoadingOverview || isLoadingTemplates || isLoadingSystem;

  const templateStats = useMemo(() => ({
    total: templates.length,
    published: templates.filter((item) => item.published).length,
    featured: templates.filter((item) => item.featured).length,
  }), [templates]);

  const canManageTemplate = useCallback(
    (template: WorkflowTemplateRecord) =>
      Boolean(user?.isSuperAdmin || (template.publisherId && template.publisherId === user?.id)),
    [user?.id, user?.isSuperAdmin],
  );

  const systemConfigPayload = {
    platformName: config.platformName,
    supportEmail: config.supportEmail,
    smtpHost: config.smtpHost,
    smtpPort: config.smtpPort,
    smtpUser: config.smtpUser,
    smtpPass: config.smtpPass,
    smtpSecure: config.smtpSecure,
    smtpIgnoreTlsCertificate: config.smtpIgnoreTlsCertificate,
    smtpFrom: config.smtpFrom,
    minioEndpoint: config.minioEndpoint,
    minioPort: config.minioPort,
    minioUseSSL: config.minioUseSSL,
    minioAccessKey: config.minioAccessKey,
    minioSecretKey: config.minioSecretKey,
    minioBucket: config.minioBucket,
    screenshotIntervalMs: config.screenshotIntervalMs,
    screenshotPersistIntervalMs: config.screenshotPersistIntervalMs,
    taskRetentionDays: config.taskRetentionDays,
    monitorPageSize: config.monitorPageSize,
    globalTaskConcurrency: config.globalTaskConcurrency,
    perUserTaskConcurrency: config.perUserTaskConcurrency,
    manualTaskPriority: config.manualTaskPriority,
    scheduledTaskPriority: config.scheduledTaskPriority,
  };

  const saveSystemConfig = useCallback(async () => {
    try {
      setIsSavingConfig(true);
      await updateSystemConfig(systemConfigPayload);
      await loadSystemSection();
      notify({
        tone: "success",
        title: "系统配置已保存",
        description: "最新配置已经同步到后台。",
      });
    } catch (error) {
      notify({
        tone: "error",
        title: "保存系统配置失败",
        description: error instanceof Error ? error.message : "请稍后重试。",
      });
    } finally {
      setIsSavingConfig(false);
    }
  }, [loadSystemSection, notify, systemConfigPayload]);

  return (
    <div className="h-screen w-screen bg-[#09090b] text-zinc-50 flex overflow-hidden font-sans selection:bg-indigo-500/30">
      <div className="fixed inset-0 z-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(56,189,248,0.12),rgba(255,255,255,0))] pointer-events-none" />
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 relative z-10">
        <AppTopbar
          title="系统管理中心"
          subtitle="这里承接平台级能力，包括用户管理、模板运营、SMTP 配置、对象存储与健康检查。"
          badge="Admin"
          actions={
            <Button variant="outline" onClick={() => void loadActiveTab()} className="gap-2">
              <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
              刷新
            </Button>
          }
        />

        <div className="flex-1 overflow-y-auto p-6 xl:p-8">
          <div className="max-w-7xl mx-auto space-y-8">
            {resetPasswordResult && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                {resetPasswordResult.email} 的临时密码：
                <span className="font-mono"> {resetPasswordResult.temporaryPassword}</span>
                {resetPasswordResult.emailSent ? "，重置邮件已自动发送。" : "，当前未发送邮件，请手动通知用户。"}
              </div>
            )}
            {createdUserResult?.temporaryPassword ? (
              <div className="rounded-xl border border-sky-500/20 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
                {createdUserResult.email} 已使用系统默认密码创建：
                <span className="font-mono"> {createdUserResult.temporaryPassword}</span>
                {createdUserResult.welcomeEmailSent ? "，欢迎邮件已自动发送。" : "，当前未发送欢迎邮件，请手动把密码通知给用户。"}
              </div>
            ) : null}

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="sticky top-0 z-10 w-fit backdrop-blur-md">
                <TabsTrigger value="overview">总览与用户</TabsTrigger>
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
                  <CardHeader className="pb-4">
                    <CardTitle>角色摘要</CardTitle>
                    <CardDescription>保留一眼能看懂的边界信息，把总览空间让给用户管理和平台动作。</CardDescription>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {overview?.roleMatrix.map((role) => (
                      <div key={role.key} className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-base font-semibold text-zinc-100">{role.name}</div>
                            <div className="mt-1 text-sm text-zinc-400">{role.summary}</div>
                          </div>
                          <Badge variant={role.key === "admin" ? "default" : "secondary"}>
                            {role.key === "admin" ? "平台角色" : "业务角色"}
                          </Badge>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {role.capabilities.slice(0, 3).map((item) => (
                            <span
                              key={item}
                              className="rounded-full border border-white/[0.06] bg-black/20 px-2.5 py-1 text-[11px] text-zinc-300"
                            >
                              {item}
                            </span>
                          ))}
                          {role.capabilities.length > 3 ? (
                            <span className="rounded-full border border-sky-500/15 bg-sky-500/10 px-2.5 py-1 text-[11px] text-sky-200">
                              其余 {role.capabilities.length - 3} 项能力
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>用户管理</CardTitle>
                    <CardDescription>支持创建用户、切换角色、停用账号和重置密码。已配置 SMTP 时会自动发送欢迎邮件和密码重置邮件。</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <Input value={newUser.name} onChange={(event) => setNewUser((current) => ({ ...current, name: event.target.value }))} placeholder="用户名称" />
                      <Input value={newUser.email} onChange={(event) => setNewUser((current) => ({ ...current, email: event.target.value }))} placeholder="邮箱地址" />
                      <Select
                        value={newUser.role}
                        onChange={(value) => setNewUser((current) => ({ ...current, role: value as "admin" | "user" }))}
                        options={[
                          { value: "user", label: "普通用户", description: "仅管理自己的工作流、任务与调度", group: "角色" },
                          { value: "admin", label: "管理员", description: "可管理用户、模板与系统配置", group: "角色" },
                        ]}
                      />
                      <Input value={newUser.password} onChange={(event) => setNewUser((current) => ({ ...current, password: event.target.value }))} placeholder="初始密码，可留空自动生成" type="password" />
                    </div>
                    <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] px-4 py-3 text-xs leading-6 text-zinc-400">
                      创建用户时密码可以留空，系统会自动生成默认密码。
                      如果管理员已经配置 SMTP，欢迎邮件会自动发送到该用户邮箱，并附带登录密码。
                    </div>
                    <div className="flex justify-end">
                      <Button
                        disabled={isCreatingUser || !newUser.name.trim() || !newUser.email.trim() || (newUser.password.trim().length > 0 && newUser.password.trim().length < 8)}
                        onClick={async () => {
                          try {
                            setIsCreatingUser(true);
                            const result = await createAdminUser({ name: newUser.name.trim(), email: newUser.email.trim(), role: newUser.role, password: newUser.password.trim() || undefined });
                            setCreatedUserResult(result);
                            setResetPasswordResult(null);
                            setNewUser({ email: "", name: "", role: "user", password: "" });
                            await loadOverviewSection();
                            notify({
                              tone: result.welcomeEmailSent ? "success" : "warning",
                              title: "用户已创建",
                              description: result.welcomeEmailSent
                                ? "欢迎邮件已自动发送。"
                                : result.temporaryPassword
                                  ? "当前未发送欢迎邮件，请手动通知默认密码。"
                                  : "新用户已经加入平台。",
                            });
                          } catch (error) {
                            notify({ tone: "error", title: "创建用户失败", description: error instanceof Error ? error.message : "请稍后重试。" });
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
                            {user.isSuperAdmin ? <Badge variant="default">超级管理员</Badge> : null}
                            <Badge variant={user.role === "admin" ? "default" : "secondary"}>{user.role === "admin" ? "管理员" : "普通用户"}</Badge>
                            <Badge variant={user.status === "active" ? "success" : "outline"}>{user.status === "active" ? "启用中" : "已停用"}</Badge>
                            <Button variant="outline" size="sm" disabled={activeUserId === user.id} onClick={async () => { const confirmed = await confirm({ title: "切换用户角色", description: `确认将 ${user.name} ${user.role === "admin" ? "改为普通用户" : "提升为管理员"}吗？`, confirmText: "确认切换", cancelText: "取消" }); if (!confirmed) { return; } try { setActiveUserId(user.id); await updateAdminUser(user.id, { role: user.role === "admin" ? "user" : "admin" }); await loadOverviewSection(); notify({ tone: "success", title: "用户角色已更新", description: `${user.name} 的角色已调整。` }); } catch (error) { notify({ tone: "error", title: "更新用户角色失败", description: error instanceof Error ? error.message : "请稍后重试。" }); } finally { setActiveUserId(null); } }}>
                              {user.role === "admin" ? "设为普通用户" : "设为管理员"}
                            </Button>
                            <Button variant="outline" size="sm" disabled={activeUserId === user.id} onClick={async () => { const confirmed = await confirm({ title: user.status === "active" ? "停用用户" : "恢复用户", description: user.status === "active" ? `确认停用 ${user.name} 吗？停用后该用户将无法登录。` : `确认恢复 ${user.name} 吗？恢复后该用户可以重新登录。`, confirmText: user.status === "active" ? "确认停用" : "确认恢复", cancelText: "取消", tone: user.status === "active" ? "danger" : "default" }); if (!confirmed) { return; } try { setActiveUserId(user.id); await updateAdminUser(user.id, { status: user.status === "active" ? "suspended" : "active" }); await loadOverviewSection(); notify({ tone: "success", title: user.status === "active" ? "用户已停用" : "用户已恢复", description: `${user.name} 的账号状态已更新。` }); } catch (error) { notify({ tone: "error", title: "更新用户状态失败", description: error instanceof Error ? error.message : "请稍后重试。" }); } finally { setActiveUserId(null); } }}>
                              {user.status === "active" ? "停用用户" : "恢复启用"}
                            </Button>
                            <Button variant="outline" size="sm" disabled={activeUserId === user.id} onClick={async () => { const confirmed = await confirm({ title: "重置用户密码", description: `确认重置 ${user.name} 的登录密码吗？系统将生成新的临时密码。`, confirmText: "确认重置", cancelText: "取消", tone: "danger" }); if (!confirmed) { return; } try { setActiveUserId(user.id); setCreatedUserResult(null); const result = await resetAdminUserPassword(user.id); setResetPasswordResult(result); notify({ tone: result.emailSent ? "success" : "warning", title: "密码已重置", description: result.emailSent ? `${user.name} 的重置邮件已自动发送。` : `${user.name} 的临时密码已经生成，请手动通知用户。` }); } catch (error) { notify({ tone: "error", title: "重置密码失败", description: error instanceof Error ? error.message : "请稍后重试。" }); } finally { setActiveUserId(null); } }}>
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
                  <CardContent className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
                    <HealthCell label="API" value={health?.api ?? "down"} />
                    <HealthCell label="数据库" value={health?.database ?? "down"} />
                    <HealthCell label="Redis" value={health?.redis ?? "down"} />
                    <HealthCell label="SMTP" value={health?.smtpConfigured ?? false} />
                    <HealthCell label="对象存储" value={health?.storageConfigured ?? false} />
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
                            await loadTemplateSection();
                            notify({ tone: "success", title: "模板草稿已创建", description: "可以继续在工作区发布真实工作流模板。" });
                          } catch (error) {
                            notify({ tone: "error", title: "创建模板失败", description: error instanceof Error ? error.message : "请稍后重试。" });
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
                      <Select
                        value={templateFilter}
                        onChange={(value) => setTemplateFilter(value as typeof templateFilter)}
                        options={[
                          { value: "all", label: "全部模板", description: "显示所有模板", group: "发布状态" },
                          { value: "true", label: "仅已发布", description: "只看已上架模板", group: "发布状态" },
                          { value: "false", label: "仅未发布", description: "只看草稿或已下架模板", group: "发布状态" },
                        ]}
                        className="w-40"
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                    {templates.map((template) => {
                      const isMine = Boolean(template.publisherId && template.publisherId === user?.id);

                      return (
                        <div key={template.id} className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-4 flex items-center justify-between gap-4">
                          <div className="min-w-0 flex flex-1 items-start gap-3">
                            <InitialAvatar name={template.authorName} className="h-9 w-9 rounded-xl text-xs" />
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <div className="text-sm font-semibold text-zinc-100">{template.title}</div>
                                <Badge variant={template.published ? "success" : "secondary"}>{template.published ? "已发布" : "草稿"}</Badge>
                                {template.featured && <Badge variant="default">推荐</Badge>}
                                {isMine ? <Badge variant="secondary">我发布的</Badge> : null}
                              </div>
                              <div className="text-xs text-zinc-500 mt-2">
                                发布者：{template.authorName} · 分类：{template.category || "未分类"} · 安装 {template.installCount.toLocaleString()} 次 · 评分 {template.rating.toFixed(1)}
                              </div>
                              <div className="text-sm text-zinc-400 mt-2">{template.description}</div>
                              {!canManageTemplate(template) ? (
                                <div className="mt-2 text-xs text-amber-300">仅模板发布者或超级管理员可编辑该模板。</div>
                              ) : null}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Button variant="outline" size="sm" disabled={!canManageTemplate(template)} title={!canManageTemplate(template) ? "仅模板发布者或超级管理员可更新该模板" : undefined} onClick={async () => { const confirmed = await confirm({ title: template.published ? "下架模板" : "发布模板", description: template.published ? `确认下架模板“${template.title}”吗？` : `确认发布模板“${template.title}”吗？`, confirmText: template.published ? "确认下架" : "确认发布", cancelText: "取消" }); if (!confirmed) { return; } try { await updateAdminTemplate(template.id, { published: !template.published }); await loadTemplateSection(); notify({ tone: "success", title: template.published ? "模板已下架" : "模板已发布", description: `“${template.title}”的发布状态已更新。` }); } catch (error) { notify({ tone: "error", title: "更新模板状态失败", description: error instanceof Error ? error.message : "请稍后重试。" }); } }}>
                              {template.published ? "下架" : "发布"}
                            </Button>
                            <Button variant="outline" size="sm" disabled={!canManageTemplate(template)} title={!canManageTemplate(template) ? "仅模板发布者或超级管理员可更新该模板" : undefined} onClick={async () => { const confirmed = await confirm({ title: template.featured ? "取消推荐" : "设为推荐", description: template.featured ? `确认取消模板“${template.title}”的推荐位吗？` : `确认将模板“${template.title}”设为推荐吗？`, confirmText: template.featured ? "确认取消" : "确认推荐", cancelText: "取消" }); if (!confirmed) { return; } try { await updateAdminTemplate(template.id, { featured: !template.featured }); await loadTemplateSection(); notify({ tone: "success", title: template.featured ? "已取消推荐" : "已设为推荐", description: `“${template.title}”的推荐位已更新。` }); } catch (error) { notify({ tone: "error", title: "更新模板推荐状态失败", description: error instanceof Error ? error.message : "请稍后重试。" }); } }}>
                              {template.featured ? "取消推荐" : "设为推荐"}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="system" className="space-y-6 xl:max-h-[calc(100vh-14rem)] xl:overflow-y-auto xl:pr-1">
                <Card>
                  <CardHeader><CardTitle>系统参数</CardTitle><CardDescription>平台级参数会影响历史截图落盘、监控分页和通知行为。实时画面已改为自适应频率。</CardDescription></CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input value={config.platformName} onChange={(event) => setConfig((current) => ({ ...current, platformName: event.target.value }))} placeholder="平台名称" />
                    <Input value={config.supportEmail ?? ""} onChange={(event) => setConfig((current) => ({ ...current, supportEmail: event.target.value }))} placeholder="支持邮箱" />
                    <Input value={String(config.screenshotIntervalMs)} onChange={(event) => setConfig((current) => ({ ...current, screenshotIntervalMs: Number(event.target.value) || 500 }))} placeholder="截图间隔毫秒（兼容保留）" />
                    <Input value={String(config.screenshotPersistIntervalMs)} onChange={(event) => setConfig((current) => ({ ...current, screenshotPersistIntervalMs: Number(event.target.value) || 3000 }))} placeholder="历史截图落盘间隔毫秒" />
                    <Input value={String(config.taskRetentionDays)} onChange={(event) => setConfig((current) => ({ ...current, taskRetentionDays: Number(event.target.value) || 30 }))} placeholder="任务保留天数" />
                    <Input value={String(config.monitorPageSize)} onChange={(event) => setConfig((current) => ({ ...current, monitorPageSize: Number(event.target.value) || 10 }))} placeholder="监控中心分页大小" />
                    <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-4 flex items-center justify-between"><div><div className="text-sm text-zinc-100">SMTP SSL/TLS</div><div className="text-xs text-zinc-500 mt-1">开启后使用安全连接发送邮件。</div></div><Button variant="outline" size="sm" onClick={() => setConfig((current) => ({ ...current, smtpSecure: !current.smtpSecure }))}>{config.smtpSecure ? "已开启" : "已关闭"}</Button></div>
                    <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-4 flex items-center justify-between"><div><div className="text-sm text-zinc-100">忽略 TLS 证书校验</div><div className="text-xs text-zinc-500 mt-1">适用于内网 SMTP 或自签名证书环境。生产公网邮箱请谨慎开启。</div></div><Button variant="outline" size="sm" onClick={() => setConfig((current) => ({ ...current, smtpIgnoreTlsCertificate: !current.smtpIgnoreTlsCertificate }))}>{config.smtpIgnoreTlsCertificate ? "已开启" : "已关闭"}</Button></div>
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
                    {smtpTestResult ? (
                      <div className="md:col-span-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                        <div className="font-medium">{smtpTestResult.message}</div>
                        <div className="mt-1 text-xs text-emerald-200/80">
                          测试时间：{new Date(smtpTestResult.checkedAt).toLocaleString("zh-CN", { hour12: false })}
                        </div>
                      </div>
                    ) : null}
                    {smtpTestError ? (
                      <div className="md:col-span-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                        {smtpTestError}
                      </div>
                    ) : null}
                    <div className="md:col-span-2 flex justify-end">
                      <div className="flex items-center gap-3">
                        <Button
                          variant="outline"
                          className="gap-2"
                          disabled={isTestingSmtp}
                          onClick={async () => {
                            try {
                              setIsTestingSmtp(true);
                              setSmtpTestResult(null);
                              setSmtpTestError(null);
                              const result = await testSystemSmtpConnection({
                                smtpHost: config.smtpHost,
                                smtpPort: config.smtpPort,
                                smtpUser: config.smtpUser,
                                smtpPass: config.smtpPass,
                                smtpSecure: config.smtpSecure,
                                smtpIgnoreTlsCertificate: config.smtpIgnoreTlsCertificate,
                              });
                              setSmtpTestResult(result);
                              notify({ tone: "success", title: "SMTP 连接成功", description: result.message });
                            } catch (error) {
                              const message = error instanceof Error ? error.message : "SMTP 测试连接失败";
                              setSmtpTestError(message);
                              notify({
                                tone: "error",
                                title: "SMTP 测试失败",
                                description: message,
                              });
                            } finally {
                              setIsTestingSmtp(false);
                            }
                          }}
                        >
                          <Mail className="w-4 h-4" />
                          {isTestingSmtp ? "测试中..." : "测试连接"}
                        </Button>
                        <Button className="gap-2" disabled={isSavingConfig} onClick={() => void saveSystemConfig()}>
                          <Settings2 className="w-4 h-4" />
                          {isSavingConfig ? "保存中..." : "保存系统配置"}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><div className="flex items-center gap-2"><Server className="w-4 h-4 text-cyan-400" /><CardTitle>MinIO 存储配置</CardTitle></div><CardDescription>历史截图会存入 MinIO，对数据库只保留对象路径与元数据。未配置时会回退到本地文件存储。</CardDescription></CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input value={config.minioEndpoint ?? ""} onChange={(event) => setConfig((current) => ({ ...current, minioEndpoint: event.target.value }))} placeholder="MinIO Endpoint" />
                    <Input value={String(config.minioPort)} onChange={(event) => setConfig((current) => ({ ...current, minioPort: Number(event.target.value) || 9000 }))} placeholder="MinIO Port" />
                    <Input value={config.minioAccessKey ?? ""} onChange={(event) => setConfig((current) => ({ ...current, minioAccessKey: event.target.value }))} placeholder="MinIO Access Key" />
                    <Input value={config.minioSecretKey ?? ""} onChange={(event) => setConfig((current) => ({ ...current, minioSecretKey: event.target.value }))} placeholder="MinIO Secret Key" />
                    <Input value={config.minioBucket ?? ""} onChange={(event) => setConfig((current) => ({ ...current, minioBucket: event.target.value }))} placeholder="Bucket 名称" />
                    <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-4 flex items-center justify-between">
                      <div>
                        <div className="text-sm text-zinc-100">MinIO SSL/TLS</div>
                        <div className="text-xs text-zinc-500 mt-1">HTTPS / TLS 部署时打开，适配对象存储安全连接。</div>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => setConfig((current) => ({ ...current, minioUseSSL: !current.minioUseSSL }))}>
                        {config.minioUseSSL ? "已开启" : "已关闭"}
                      </Button>
                    </div>
                    {minioTestResult ? (
                      <div
                        className={cn(
                          "md:col-span-2 rounded-xl px-4 py-3 text-sm",
                          minioTestResult.bucketExists
                            ? "border border-emerald-500/20 bg-emerald-500/10 text-emerald-100"
                            : "border border-amber-500/20 bg-amber-500/10 text-amber-100",
                        )}
                      >
                        <div className="font-medium">{minioTestResult.message}</div>
                        <div className="mt-2 grid gap-1 text-xs opacity-90 md:grid-cols-2">
                          <div>Endpoint：{minioTestResult.endpoint}:{minioTestResult.port}</div>
                          <div>协议：{minioTestResult.useSSL ? "HTTPS / SSL" : "HTTP"}</div>
                          <div>Bucket：{minioTestResult.bucket}</div>
                          <div>状态：{minioTestResult.bucketExists ? "Bucket 已存在" : "Bucket 不存在"}</div>
                        </div>
                        <div className="mt-2 text-xs opacity-80">
                          测试时间：{new Date(minioTestResult.checkedAt).toLocaleString("zh-CN", { hour12: false })}
                        </div>
                      </div>
                    ) : null}
                    {minioTestError ? (
                      <div className="md:col-span-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                        {minioTestError}
                      </div>
                    ) : null}
                    <div className="md:col-span-2 flex justify-end">
                      <div className="flex items-center gap-3">
                        <Button
                          variant="outline"
                          className="gap-2"
                          disabled={Boolean(minioTestMode)}
                          onClick={async () => {
                            try {
                              setMinioTestMode("connection");
                              setMinioTestResult(null);
                              setMinioTestError(null);
                              const result = await testSystemMinioConnection({
                                minioEndpoint: config.minioEndpoint,
                                minioPort: config.minioPort,
                                minioUseSSL: config.minioUseSSL,
                                minioAccessKey: config.minioAccessKey,
                                minioSecretKey: config.minioSecretKey,
                                minioBucket: config.minioBucket,
                              });
                              setMinioTestResult(result);
                              notify({ tone: "success", title: "MinIO 连接成功", description: result.message });
                            } catch (error) {
                              const message = error instanceof Error ? error.message : "MinIO 连接测试失败";
                              setMinioTestError(message);
                              notify({
                                tone: "error",
                                title: "MinIO 连接测试失败",
                                description: message,
                              });
                            } finally {
                              setMinioTestMode(null);
                            }
                          }}
                        >
                          <Server className="w-4 h-4" />
                          {minioTestMode === "connection" ? "连接测试中..." : "测试连接"}
                        </Button>
                        <Button
                          variant="outline"
                          className="gap-2"
                          disabled={Boolean(minioTestMode)}
                          onClick={async () => {
                            try {
                              setMinioTestMode("bucket");
                              setMinioTestResult(null);
                              setMinioTestError(null);
                              const result = await testSystemMinioConnection({
                                minioEndpoint: config.minioEndpoint,
                                minioPort: config.minioPort,
                                minioUseSSL: config.minioUseSSL,
                                minioAccessKey: config.minioAccessKey,
                                minioSecretKey: config.minioSecretKey,
                                minioBucket: config.minioBucket,
                              });
                              setMinioTestResult(result);
                              notify({ tone: "success", title: "MinIO Bucket 检查完成", description: result.message });
                            } catch (error) {
                              const message = error instanceof Error ? error.message : "MinIO Bucket 测试失败";
                              setMinioTestError(message);
                              notify({
                                tone: "error",
                                title: "MinIO Bucket 测试失败",
                                description: message,
                              });
                            } finally {
                              setMinioTestMode(null);
                            }
                          }}
                        >
                          <ShieldCheck className="w-4 h-4" />
                          {minioTestMode === "bucket" ? "Bucket 测试中..." : "测试 bucket"}
                        </Button>
                        <Button className="gap-2" disabled={isSavingConfig} onClick={() => void saveSystemConfig()}>
                          <Settings2 className="w-4 h-4" />
                          {isSavingConfig ? "保存中..." : "保存系统配置"}
                        </Button>
                      </div>
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
