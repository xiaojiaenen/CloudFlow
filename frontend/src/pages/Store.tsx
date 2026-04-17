import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, Layers3, RefreshCw, Search, Sparkles, Star } from "lucide-react";
import { AppTopbar } from "@/src/components/AppTopbar";
import { InitialAvatar } from "@/src/components/InitialAvatar";
import { Sidebar } from "@/src/components/Sidebar";
import { Badge } from "@/src/components/ui/Badge";
import { Button } from "@/src/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/Card";
import { Input } from "@/src/components/ui/Input";
import { Select } from "@/src/components/ui/Select";
import { useAuth } from "@/src/context/AuthContext";
import { useNotice } from "@/src/context/NoticeContext";
import { useDebouncedValue } from "@/src/hooks/useDebouncedValue";
import { createWorkflow, listStoreTemplates, listWorkflows, type WorkflowRecord, type WorkflowTemplateRecord } from "@/src/lib/cloudflow";
import { cn } from "@/src/lib/utils";

export default function Store() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { notify } = useNotice();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [workflows, setWorkflows] = useState<WorkflowRecord[]>([]);
  const [templates, setTemplates] = useState<WorkflowTemplateRecord[]>([]);
  const [allTemplateCategories, setAllTemplateCategories] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const debouncedSearch = useDebouncedValue(search, 350);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [workflowData, templateData, allTemplates] = await Promise.all([
        listWorkflows(),
        listStoreTemplates({
          search: debouncedSearch,
          category: category === "all" ? undefined : category,
        }),
        listStoreTemplates(),
      ]);

      setWorkflows(workflowData);
      setTemplates(templateData);
      setAllTemplateCategories(
        Array.from(new Set(allTemplates.map((item) => item.category).filter(Boolean))),
      );
    } catch (error) {
      notify({
        tone: "error",
        title: "加载商店失败",
        description: error instanceof Error ? error.message : "请稍后重试。",
      });
    } finally {
      setIsLoading(false);
    }
  }, [category, debouncedSearch, notify]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const installedWorkflows = useMemo(() => {
    return new Map(
      workflows
        .filter((workflow) => workflow.installedFromTemplateId)
        .map((workflow) => [workflow.installedFromTemplateId as string, workflow]),
    );
  }, [workflows]);

  const categories = useMemo(() => {
    return ["all", ...allTemplateCategories];
  }, [allTemplateCategories]);

  const categoryOptions = useMemo(() => {
    return categories.map((item) => ({
      value: item,
      label: item === "all" ? "全部分类" : item,
      description: item === "all" ? "查看所有已发布模板" : `只看 ${item} 分类模板`,
      icon: <Layers3 className="h-3.5 w-3.5" />,
      group: "模板分类",
      keywords: [item],
    }));
  }, [categories]);

  const handleInstall = async (template: WorkflowTemplateRecord) => {
    const existingWorkflow = installedWorkflows.get(template.id);
    if (existingWorkflow) {
      navigate(`/?workflowId=${existingWorkflow.id}`);
      return;
    }

    try {
      setInstallingId(template.id);
      const createdWorkflow = await createWorkflow({
        name: template.title,
        description: template.description,
        status: "active",
        installedFromTemplateId: template.id,
        definition: template.definition,
      });

      navigate(`/?workflowId=${createdWorkflow.id}`);
      notify({
        tone: "success",
        title: "模板已安装",
        description: `“${template.title}”已经导入到你的工作区。`,
      });
    } catch (error) {
      notify({
        tone: "error",
        title: "安装模板失败",
        description: error instanceof Error ? error.message : "请稍后重试。",
      });
    } finally {
      setInstallingId(null);
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0B0C10] font-sans text-zinc-50 selection:bg-white/20">
      <Sidebar />
      <div className="relative flex min-w-0 flex-1 flex-col bg-[#0B0C10]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/10 via-transparent to-transparent" />
        <AppTopbar
          title="工作流商店"
          subtitle="浏览已发布模板，安装到你的工作区，并随时回到已安装工作流继续编辑。"
          badge="Store"
          actions={
            <Button variant="outline" size="sm" onClick={() => void loadData()} className="gap-2">
              <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
              刷新
            </Button>
          }
        />

        <div className="z-10 flex-1 overflow-y-auto p-8">
          <div className="mx-auto max-w-6xl space-y-6">
            <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
              <div className="text-sm text-zinc-500">
                当前找到 {templates.length} 个模板，可直接搜索、筛选并一键安装。
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative w-full md:w-72">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="搜索模板标题、作者或描述"
                    className="pl-9"
                  />
                </div>
                <Select
                  value={category}
                  onChange={setCategory}
                  options={categoryOptions}
                  className="min-w-[220px]"
                  searchable
                  searchPlaceholder="搜索分类"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {templates.map((template) => {
                const installedWorkflow = installedWorkflows.get(template.id);
                const isMine = Boolean(template.publisherId && template.publisherId === user?.id);

                return (
                  <Card
                    key={template.id}
                    className="flex flex-col border-white/[0.08] bg-[#121212]/80 backdrop-blur-sm transition-colors hover:border-white/[0.15]"
                  >
                    <CardHeader>
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <CardTitle className="text-lg">{template.title}</CardTitle>
                            {template.featured ? (
                              <Badge variant="success" className="gap-1">
                                <Sparkles className="h-3 w-3" />
                                推荐
                              </Badge>
                            ) : null}
                            {isMine ? <Badge variant="secondary">我发布的</Badge> : null}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-zinc-400">
                            <InitialAvatar name={template.authorName} className="h-8 w-8 rounded-xl text-xs" />
                            <div className="min-w-0">
                              <div className="truncate font-medium text-zinc-200">{template.authorName}</div>
                              <div className="mt-0.5 truncate text-zinc-500">{template.category || "未分类"}</div>
                            </div>
                          </div>
                        </div>
                        {installedWorkflow ? <Badge variant="success">已安装</Badge> : null}
                      </div>
                      <CardDescription className="line-clamp-3 min-h-[60px]">{template.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1 space-y-4">
                      <div className="flex flex-wrap gap-2">
                        {template.tags.map((tag) => (
                          <Badge key={tag} variant="secondary">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                      <div className="text-xs text-zinc-500">
                        包含 {template.definition.nodes.length} 个核心节点，安装后可立即继续编辑。
                      </div>
                    </CardContent>
                    <div className="mt-auto flex items-center justify-between gap-3 px-6 pb-6 pt-0">
                      <div className="flex items-center gap-4 text-xs text-zinc-500">
                        <div className="flex items-center gap-1">
                          <Download className="h-3.5 w-3.5" />
                          {template.installCount.toLocaleString()}
                        </div>
                        <div className="flex items-center gap-1">
                          <Star className="h-3.5 w-3.5 text-amber-400" />
                          {template.rating.toFixed(1)}
                        </div>
                      </div>
                      <Button
                        variant={installedWorkflow ? "outline" : "default"}
                        size="sm"
                        disabled={installingId === template.id}
                        onClick={() => void handleInstall(template)}
                      >
                        {installingId === template.id ? "安装中..." : installedWorkflow ? "打开" : "安装"}
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>

            {templates.length === 0 && !isLoading ? (
              <div className="rounded-xl border border-dashed border-white/[0.08] bg-white/[0.02] p-10 text-center text-sm text-zinc-500">
                当前筛选条件下没有匹配模板，试试切换分类或清空搜索词。
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
