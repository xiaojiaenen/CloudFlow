import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sidebar } from "@/src/components/Sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/Card";
import { Button } from "@/src/components/ui/Button";
import { Badge } from "@/src/components/ui/Badge";
import { Download, Search, Sparkles, Star, RefreshCw } from "lucide-react";
import { Input } from "@/src/components/ui/Input";
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
    return ["all", ...Array.from(new Set(templates.map((item) => item.category)))];
  }, [templates]);

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
    <div className="h-screen w-screen bg-[#0B0C10] text-zinc-50 flex overflow-hidden font-sans selection:bg-white/20">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 bg-[#0B0C10] relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/10 via-transparent to-transparent pointer-events-none" />

        <div className="h-14 border-b border-white/[0.08] bg-[#0A0A0A] flex items-center px-6 z-10">
          <h1 className="text-sm font-medium text-zinc-100">工作流商店</h1>
        </div>

        <div className="flex-1 overflow-y-auto p-8 z-10">
          <div className="max-w-6xl mx-auto space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight mb-1">发现工作流</h2>
                <p className="text-sm text-zinc-400">模板现在已经完全来自后端，可由管理员发布、下架、分类和推荐。</p>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="relative w-full md:w-72">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索模板..." className="pl-9" />
                </div>
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  className="flex h-10 rounded-md border border-white/[0.06] bg-zinc-900/50 px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
                >
                  {categories.map((item) => (
                    <option key={item} value={item}>
                      {item === "all" ? "全部分类" : item}
                    </option>
                  ))}
                </select>
                <Button variant="outline" size="sm" onClick={() => void loadData()} className="gap-2">
                  <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
                  刷新
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {templates.map((item) => {
                const installedWorkflow = installedWorkflows.get(item.title);
                return (
                  <Card key={item.id} className="flex flex-col hover:border-white/[0.15] transition-colors bg-[#121212]/80 backdrop-blur-sm">
                    <CardHeader>
                      <div className="flex justify-between items-start mb-2 gap-3">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <CardTitle className="text-lg">{item.title}</CardTitle>
                            {item.featured && (
                              <Badge variant="success" className="gap-1">
                                <Sparkles className="w-3 h-3" />
                                推荐
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs text-zinc-500">
                            {item.authorName} · {item.category}
                          </div>
                        </div>
                        {installedWorkflow && <Badge variant="success">已导入</Badge>}
                      </div>
                      <CardDescription className="line-clamp-3 min-h-[60px]">
                        {item.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1 space-y-4">
                      <div className="flex flex-wrap gap-2">
                        {item.tags.map((tag) => (
                          <Badge key={tag} variant="secondary">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                      <div className="text-xs text-zinc-500">包含 {item.definition.nodes.length} 个核心节点，可直接在工作区继续编辑。</div>
                    </CardContent>
                    <div className="px-6 pb-6 pt-0 mt-auto flex items-center justify-between gap-3">
                      <div className="flex items-center gap-4 text-xs text-zinc-500">
                        <div className="flex items-center gap-1">
                          <Download className="w-3.5 h-3.5" />
                          {item.installCount.toLocaleString()}
                        </div>
                        <div className="flex items-center gap-1">
                          <Star className="w-3.5 h-3.5 text-amber-400" />
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

            {templates.length === 0 && !isLoading && (
              <div className="rounded-xl border border-dashed border-white/[0.08] bg-white/[0.02] p-10 text-center text-sm text-zinc-500">
                当前没有符合条件的模板，试试切换分类或清空搜索词。
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
