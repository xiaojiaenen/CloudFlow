import { Sidebar } from "@/src/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/Card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/Table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/src/components/ui/Tabs";
import { Badge } from "@/src/components/ui/Badge";
import { Button } from "@/src/components/ui/Button";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import { Users, Activity, ShoppingBag, Server, MoreHorizontal, Trash2, Edit } from "lucide-react";

const executionData = [
  { name: "Mon", executions: 4000 },
  { name: "Tue", executions: 3000 },
  { name: "Wed", executions: 5000 },
  { name: "Thu", executions: 2780 },
  { name: "Fri", executions: 6890 },
  { name: "Sat", executions: 2390 },
  { name: "Sun", executions: 3490 },
];

const userData = [
  { name: "Free", users: 400 },
  { name: "Pro", users: 300 },
  { name: "Enterprise", users: 100 },
];

const usersList = [
  { id: "1", name: "Alice Wang", email: "alice@example.com", role: "Admin", status: "Active", joined: "2023-01-15" },
  { id: "2", name: "Bob Smith", email: "bob@example.com", role: "User", status: "Active", joined: "2023-03-22" },
  { id: "3", name: "Charlie Li", email: "charlie@example.com", role: "User", status: "Suspended", joined: "2023-05-10" },
  { id: "4", name: "Diana Chen", email: "diana@example.com", role: "Pro", status: "Active", joined: "2023-08-05" },
];

const workflowsList = [
  { id: "1", name: "亚马逊商品监控", author: "Alice Wang", usage: 12450, status: "Published", lastUpdated: "2023-10-01" },
  { id: "2", name: "Twitter 自动回复", author: "Bob Smith", usage: 8200, status: "Published", lastUpdated: "2023-10-05" },
  { id: "3", name: "内部数据同步", author: "Charlie Li", usage: 150, status: "Draft", lastUpdated: "2023-10-10" },
];

export default function Admin() {
  return (
    <div className="h-screen w-screen bg-[#09090b] text-zinc-50 flex overflow-hidden font-sans selection:bg-indigo-500/30">
      {/* Deep Glow Background */}
      <div className="fixed inset-0 z-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.15),rgba(255,255,255,0))] pointer-events-none"></div>

      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 relative z-10">
        <div className="h-14 border-b border-white/[0.05] bg-zinc-950/50 backdrop-blur-md flex items-center px-6 z-10">
          <h1 className="text-sm font-medium text-zinc-100">管理后台</h1>
        </div>

        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-6xl mx-auto space-y-8">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight mb-1">系统管理</h2>
              <p className="text-sm text-zinc-400">管理用户、工作流及查看系统运行状态。</p>
            </div>

            <Tabs defaultValue="overview">
              <TabsList>
                <TabsTrigger value="overview">总览</TabsTrigger>
                <TabsTrigger value="users">用户管理</TabsTrigger>
                <TabsTrigger value="workflows">工作流管理</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-6">
                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">总用户数</CardTitle>
                      <Users className="h-4 w-4 text-zinc-400" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">12,345</div>
                      <p className="text-xs text-zinc-500">+180 本周</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">活跃工作流</CardTitle>
                      <Activity className="h-4 w-4 text-zinc-400" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">8,234</div>
                      <p className="text-xs text-zinc-500">+12% 较上月</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">商店下载量</CardTitle>
                      <ShoppingBag className="h-4 w-4 text-zinc-400" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">45.2k</div>
                      <p className="text-xs text-zinc-500">+2.4k 本周</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">服务器负载</CardTitle>
                      <Server className="h-4 w-4 text-zinc-400" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">42%</div>
                      <p className="text-xs text-emerald-500">运行健康</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Charts */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card className="col-span-1">
                    <CardHeader>
                      <CardTitle>工作流执行趋势</CardTitle>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={executionData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                          <XAxis dataKey="name" stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} />
                          <YAxis stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}`} />
                          <Tooltip contentStyle={{ backgroundColor: '#18181b', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px' }} />
                          <Line type="monotone" dataKey="executions" stroke="#6366f1" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card className="col-span-1">
                    <CardHeader>
                      <CardTitle>用户分布</CardTitle>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={userData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                          <XAxis dataKey="name" stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} />
                          <YAxis stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} />
                          <Tooltip contentStyle={{ backgroundColor: '#18181b', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px' }} cursor={{fill: 'rgba(255,255,255,0.02)'}} />
                          <Bar dataKey="users" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="users">
                <Card>
                  <CardHeader>
                    <CardTitle>用户列表</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>姓名</TableHead>
                          <TableHead>邮箱</TableHead>
                          <TableHead>角色</TableHead>
                          <TableHead>状态</TableHead>
                          <TableHead>加入时间</TableHead>
                          <TableHead className="text-right">操作</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {usersList.map((user) => (
                          <TableRow key={user.id}>
                            <TableCell className="font-medium text-zinc-200">{user.name}</TableCell>
                            <TableCell>{user.email}</TableCell>
                            <TableCell>
                              <Badge variant={user.role === "Admin" ? "default" : "secondary"}>{user.role}</Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={user.status === "Active" ? "success" : "outline"}>{user.status}</Badge>
                            </TableCell>
                            <TableCell>{user.joined}</TableCell>
                            <TableCell className="text-right">
                              <Button variant="ghost" size="icon"><Edit className="w-4 h-4" /></Button>
                              <Button variant="ghost" size="icon" className="text-red-400 hover:text-red-300 hover:bg-red-400/10"><Trash2 className="w-4 h-4" /></Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="workflows">
                <Card>
                  <CardHeader>
                    <CardTitle>工作流列表</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>工作流名称</TableHead>
                          <TableHead>作者</TableHead>
                          <TableHead>使用次数</TableHead>
                          <TableHead>状态</TableHead>
                          <TableHead>最后更新</TableHead>
                          <TableHead className="text-right">操作</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {workflowsList.map((wf) => (
                          <TableRow key={wf.id}>
                            <TableCell className="font-medium text-zinc-200">{wf.name}</TableCell>
                            <TableCell>{wf.author}</TableCell>
                            <TableCell>{wf.usage.toLocaleString()}</TableCell>
                            <TableCell>
                              <Badge variant={wf.status === "Published" ? "success" : "secondary"}>{wf.status}</Badge>
                            </TableCell>
                            <TableCell>{wf.lastUpdated}</TableCell>
                            <TableCell className="text-right">
                              <Button variant="ghost" size="icon"><MoreHorizontal className="w-4 h-4" /></Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
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
