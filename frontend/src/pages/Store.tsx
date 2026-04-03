import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, Layers3, RefreshCw, Search, Sparkles, Star } from "lucide-react";
import { AppTopbar } from "@/src/components/AppTopbar";
import { Sidebar } from "@/src/components/Sidebar";
import { Badge } from "@/src/components/ui/Badge";
import { Button } from "@/src/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/Card";
import { Input } from "@/src/components/ui/Input";
import { Select } from "@/src/components/ui/Select";
import {
  createWorkflow,
  listStoreTemplates,
  listWorkflows,
  markStoreTemplateInstalled,
  WorkflowRecord,
  WorkflowTemplateRecord,
} from "@/src/lib/cloudflow";
import { cn } from "@/src/lib/utils";

export default function Store() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [workflows, setWorkflows] = useState<WorkflowRecord[]>([]);
  const [templates, setTemplates] = useState<WorkflowTemplateRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [installingId, setInstallingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [workflowData, templateData] = await Promise.all([
        listWorkflows(),
        listStoreTemplates({
          search,
          category: category === "all" ? undefined : category,
        }),
      ]);
      setWorkflows(workflowData);
      setTemplates(templateData);
    } finally {
      setIsLoading(false);
    }
  }, [category, search]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const installedWorkflows = useMemo(() => {
    return new Map(workflows.map((workflow) => [workflow.name, workflow]));
  }, [workflows]);

  const categories = useMemo(() => {
    return ["all", ...Array.from(new Set(templates.map((item) => item.category).filter(Boolean)))];
  }, [templates]);

  const categoryOptions = useMemo(() => {
    return categories.map((item) => ({
      value: item,
      label: item === "all" ? "全部分类" : item,
      description: item === "all" ? "查看所有可安装模板" : `筛选 ${item} 分类模板`,
      icon: <Layers3 className="h-3.5 w-3.5" />,
      group: "模板分类",
      keywords: [item],
    }));
  }, [categories]);

  const handleInstall = async (item: WorkflowTemplateRecord) => {
    const existingWorkflow = installedWorkflows.get(item.title);
    if (existingWorkflow) {
      navigate(`/?workflowId=${existingWorkflow.id}`);
      return;
    }

    try {
      setInstallingId(item.id);
      const createdWorkflow = await createWorkflow({
        name: item.title,
        description: `${item.description}（来自工作流商店）`,
        status: "active",
        definition: item.definition,
      });
      await markStoreTemplateInstalled(item.id);
      navigate(`/?workflowId=${createdWorkflow.id}`);
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
          title="发现工作流模板"
          subtitle="模板来自后台发布流程，支持分类、推荐位和安装统计。安装后可直接继续编辑和运行。"
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
              <div className="text-sm text-zinc-500">共找到 {templates.length} 个可用模板，支持搜索、分类筛选和一键安装。</div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative w-full md:w-72">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                  <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索模板..." className="pl-9" />
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
              {templates.map((item) => {
                const installedWorkflow = installedWorkflows.get(item.title);
                return (
                  <Card
                    key={item.id}
                    className="flex flex-col border-white/[0.08] bg-[#121212]/80 backdrop-blur-sm transition-colors hover:border-white/[0.15]"
                  >
                    <CardHeader>
                      <div className="mb-2 flex items-start justify-between gap-3">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <CardTitle className="text-lg">{item.title}</CardTitle>
                            {item.featured ? (
                              <Badge variant="success" className="gap-1">
                                <Sparkles className="h-3 w-3" />
                                推荐
                              </Badge>
                            ) : null}
                          </div>
                          <div className="text-xs text-zinc-500">
                            {item.authorName} · {item.category}
                          </div>
                        </div>
                        {installedWorkflow ? <Badge variant="success">已导入</Badge> : null}
                      </div>
                      <CardDescription className="line-clamp-3 min-h-[60px]">{item.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1 space-y-4">
                      <div className="flex flex-wrap gap-2">
                        {item.tags.map((tag) => (
                          <Badge key={tag} variant="secondary">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                      <div className="text-xs text-zinc-500">
                        包含 {item.definition.nodes.length} 个核心节点，安装后可直接在工作区继续编辑。
                      </div>
                    </CardContent>
                    <div className="mt-auto flex items-center justify-between gap-3 px-6 pb-6 pt-0">
                      <div className="flex items-center gap-4 text-xs text-zinc-500">
                        <div className="flex items-center gap-1">
                          <Download className="h-3.5 w-3.5" />
                          {item.installCount.toLocaleString()}
                        </div>
                        <div className="flex items-center gap-1">
                          <Star className="h-3.5 w-3.5 text-amber-400" />
                          {item.rating.toFixed(1)}
                        </div>
                      </div>
                      <Button
                        variant={installedWorkflow ? "outline" : "default"}
                        size="sm"
                        disabled={installingId === item.id}
                        onClick={() => void handleInstall(item)}
                      >
                        {installingId === item.id ? "导入中..." : installedWorkflow ? "打开" : "获取"}
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>

            {templates.length === 0 && !isLoading ? (
              <div className="rounded-xl border border-dashed border-white/[0.08] bg-white/[0.02] p-10 text-center text-sm text-zinc-500">
                当前没有符合条件的模板，试试切换分类或清空搜索词。
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
