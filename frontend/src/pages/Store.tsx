import { Sidebar } from "@/src/components/Sidebar";
import { Header } from "@/src/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/Card";
import { Button } from "@/src/components/ui/Button";
import { Badge } from "@/src/components/ui/Badge";
import { Download, Star, Users, Search } from "lucide-react";
import { Input } from "@/src/components/ui/Input";

const storeItems = [
  {
    id: "1",
    title: "亚马逊商品监控",
    description: "自动搜索并提取指定商品的最新价格、评价，并同步至 Notion 数据库。",
    downloads: "12.4k",
    rating: 4.9,
    tags: ["电商", "数据抓取"],
    installed: true,
  },
  {
    id: "2",
    title: "Twitter 自动回复机器人",
    description: "监听特定关键词，并使用 AI 生成回复自动参与互动。",
    downloads: "8.2k",
    rating: 4.7,
    tags: ["社交媒体", "AI"],
    installed: false,
  },
  {
    id: "3",
    title: "每日新闻摘要推送",
    description: "抓取 HackerNews 首页，生成中文摘要并推送到企业微信/飞书。",
    downloads: "5.1k",
    rating: 4.8,
    tags: ["效率", "通知"],
    installed: false,
  },
  {
    id: "4",
    title: "竞品网站变动监控",
    description: "定时截取竞品网站首页，对比差异并在发现重大改版时发送邮件告警。",
    downloads: "3.6k",
    rating: 4.6,
    tags: ["监控", "竞品分析"],
    installed: false,
  },
];

export default function Store() {
  return (
    <div className="h-screen w-screen bg-[#0B0C10] text-zinc-50 flex overflow-hidden font-sans selection:bg-white/20">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 bg-[#0B0C10] relative">
        {/* Breathing Background */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/10 via-transparent to-transparent pointer-events-none"></div>

        <div className="h-14 border-b border-white/[0.08] bg-[#0A0A0A] flex items-center px-6 z-10">
          <h1 className="text-sm font-medium text-zinc-100">工作流商店</h1>
        </div>

        <div className="flex-1 overflow-y-auto p-8 z-10">
          <div className="max-w-6xl mx-auto space-y-8">
            {/* Header & Search */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight mb-1">发现工作流</h2>
                <p className="text-sm text-zinc-400">探索并安装社区分享的自动化工作流，提升您的效率。</p>
              </div>
              <div className="relative w-full md:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <Input placeholder="搜索工作流..." className="pl-9" />
              </div>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {storeItems.map((item) => (
                <Card key={item.id} className="flex flex-col hover:border-white/[0.15] transition-colors bg-[#121212]/80 backdrop-blur-sm">
                  <CardHeader>
                    <div className="flex justify-between items-start mb-2">
                      <CardTitle className="text-lg">{item.title}</CardTitle>
                      {item.installed && <Badge variant="success">已安装</Badge>}
                    </div>
                    <CardDescription className="line-clamp-2 h-10">
                      {item.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex-1">
                    <div className="flex flex-wrap gap-2">
                      {item.tags.map((tag) => (
                        <Badge key={tag} variant="secondary">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                  <div className="px-6 pb-6 pt-0 mt-auto flex items-center justify-between">
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
                    <Button variant={item.installed ? "outline" : "default"} size="sm">
                      {item.installed ? "打开" : "获取"}
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
