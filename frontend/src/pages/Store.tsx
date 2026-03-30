import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sidebar } from "@/src/components/Sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/Card";
import { Button } from "@/src/components/ui/Button";
import { Badge } from "@/src/components/ui/Badge";
import { Download, Star, Search, RefreshCw } from "lucide-react";
import { Input } from "@/src/components/ui/Input";
import { createWorkflow, listWorkflows, WorkflowRecord } from "@/src/lib/cloudflow";
import { cn } from "@/src/lib/utils";

const storeItems = [
  {
    id: "amazon-monitor",
    title: "亚马逊商品监控",
    description: "自动打开目标商品页，提取价格和标题，并保留截图供后续复盘。",
    downloads: "12.4k",
    rating: 4.9,
    tags: ["电商", "数据抓取"],
    definition: {
      nodes: [
        { type: "open_page", url: "https://example.com/product" },
        { type: "extract", selector: "h1", property: "text" },
        { type: "extract", selector: ".price", property: "text" },
        { type: "screenshot", scope: "viewport" },
      ],
    },
  },
  {
    id: "daily-briefing",
    title: "每日新闻摘要推送",
    description: "抓取首页标题和摘要块，保存截图，适合作为日报类自动化模板。",
    downloads: "5.1k",
    rating: 4.8,
    tags: ["效率", "通知"],
    definition: {
      nodes: [
        { type: "open_page", url: "https://news.ycombinator.com/" },
        { type: "extract", selector: ".titleline a", property: "text" },
        { type: "scroll", direction: "down", distance: 600 },
        { type: "screenshot", scope: "full" },
      ],
    },
  },
  {
    id: "site-change-monitor",
    title: "竞品网站变动监控",
    description: "定时打开竞品页面，滚动抓取首屏后全页截图，适合改版监控和视觉巡检。",
    downloads: "3.6k",
    rating: 4.6,
    tags: ["监控", "竞品分析"],
    definition: {
      nodes: [
        { type: "open_page", url: "https://example.com" },
        { type: "wait", time: 1500 },
        { type: "scroll", direction: "down", distance: 800 },
        { type: "screenshot", scope: "full" },
      ],
    },
  },
];

export default function Store() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [workflows, setWorkflows] = useState<WorkflowRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [installingId, setInstallingId] = useState<string | null>(null);

  useEffect(() => {
    const loadWorkflows = async () => {
      try {
        setIsLoading(true);
        setWorkflows(await listWorkflows());
      } finally {
        setIsLoading(false);
      }
    };

    void loadWorkflows();
  }, []);

  const installedWorkflows = useMemo(() => {
    return new Map(workflows.map((workflow) => [workflow.name, workflow]));
  }, [workflows]);

  const filteredItems = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) {
      return storeItems;
    }

    return storeItems.filter((item) =>
      [item.title, item.description, ...item.tags].some((value) =>
        value.toLowerCase().includes(keyword),
      ),
    );
  }, [search]);

  const handleInstall = async (item: (typeof storeItems)[number]) => {
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
        definition: item.definition,
      });
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
                <p className="text-sm text-zinc-400">探索并导入预置模板，直接接入当前后端能力。</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative w-full md:w-72">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索工作流..." className="pl-9" />
                </div>
                <Button variant="outline" size="sm" onClick={() => void listWorkflows().then(setWorkflows)} className="gap-2">
                  <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
                  刷新
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredItems.map((item) => {
                const installedWorkflow = installedWorkflows.get(item.title);
                return (
                  <Card key={item.id} className="flex flex-col hover:border-white/[0.15] transition-colors bg-[#121212]/80 backdrop-blur-sm">
                    <CardHeader>
                      <div className="flex justify-between items-start mb-2 gap-3">
                        <CardTitle className="text-lg">{item.title}</CardTitle>
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
                          {item.downloads}
                        </div>
                        <div className="flex items-center gap-1">
                          <Star className="w-3.5 h-3.5 text-amber-400" />
                          {item.rating}
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
          </div>
        </div>
      </div>
    </div>
  );
}
