import React, { useState, useEffect } from 'react';
import { Sidebar } from '@/src/components/Sidebar';
import { Activity, Cpu, MemoryStick, Server, Play, AlertCircle, CheckCircle2 } from 'lucide-react';
import ReactECharts from 'echarts-for-react';
import { cn } from '@/src/lib/utils';

// Mock data for charts
const generateData = () => {
  const data = [];
  let cpu = 40;
  let mem = 60;
  for (let i = 0; i < 20; i++) {
    cpu = Math.max(10, Math.min(90, cpu + (Math.random() - 0.5) * 20));
    mem = Math.max(20, Math.min(80, mem + (Math.random() - 0.5) * 10));
    data.push({
      time: `10:${i.toString().padStart(2, '0')}`,
      cpu: Math.round(cpu),
      memory: Math.round(mem),
    });
  }
  return data;
};

const activeWorkflows = [
  { id: 1, name: "抓取亚马逊商品", status: "running", duration: "00:12:45", step: "提取商品价格", container: "worker-node-01" },
  { id: 2, name: "Twitter 自动发推", status: "running", duration: "00:03:12", step: "输入文本", container: "worker-node-03" },
  { id: 3, name: "竞品价格监控", status: "success", duration: "00:45:00", step: "完成", container: "worker-node-02" },
];

export function MonitorCenter() {
  const [data, setData] = useState(generateData());

  useEffect(() => {
    const interval = setInterval(() => {
      setData((currentData) => {
        const newData = [...currentData.slice(1)];
        const last = currentData[currentData.length - 1];
        let cpu = Math.max(10, Math.min(90, last.cpu + (Math.random() - 0.5) * 20));
        let mem = Math.max(20, Math.min(80, last.memory + (Math.random() - 0.5) * 10));
        
        const timeParts = last.time.split(':');
        let min = parseInt(timeParts[1]) + 1;
        let hr = parseInt(timeParts[0]);
        if (min >= 60) {
          min = 0;
          hr++;
        }
        
        newData.push({
          time: `${hr}:${min.toString().padStart(2, '0')}`,
          cpu: Math.round(cpu),
          memory: Math.round(mem),
        });
        return newData;
      });
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const cpuOption = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#09090b',
      borderColor: 'rgba(255,255,255,0.1)',
      textStyle: { color: '#f4f4f5' }
    },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: data.map(d => d.time),
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.2)' } },
      axisLabel: { color: 'rgba(255,255,255,0.5)' }
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)', type: 'dashed' } },
      axisLabel: { color: 'rgba(255,255,255,0.5)', formatter: '{value}%' }
    },
    series: [
      {
        name: 'CPU',
        type: 'line',
        smooth: true,
        symbol: 'none',
        itemStyle: { color: '#0ea5e9' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(14,165,233,0.3)' },
              { offset: 1, color: 'rgba(14,165,233,0)' }
            ]
          }
        },
        data: data.map(d => d.cpu)
      }
    ]
  };

  const memoryOption = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#09090b',
      borderColor: 'rgba(255,255,255,0.1)',
      textStyle: { color: '#f4f4f5' }
    },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: data.map(d => d.time),
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.2)' } },
      axisLabel: { color: 'rgba(255,255,255,0.5)' }
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)', type: 'dashed' } },
      axisLabel: { color: 'rgba(255,255,255,0.5)', formatter: '{value}%' }
    },
    series: [
      {
        name: 'Memory',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        showSymbol: false,
        itemStyle: { color: '#10b981' },
        lineStyle: { width: 2 },
        data: data.map(d => d.memory)
      }
    ]
  };

  return (
    <div className="h-screen w-screen bg-[#09090b] text-zinc-50 flex overflow-hidden font-sans selection:bg-sky-500/30">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 bg-[#09090b] relative overflow-y-auto">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-sky-900/10 via-transparent to-transparent pointer-events-none"></div>
        
        <div className="p-8 max-w-7xl mx-auto w-full space-y-8 relative z-10">
          <div>
            <h1 className="text-2xl font-bold text-zinc-100 tracking-tight flex items-center gap-3">
              <Activity className="w-6 h-6 text-sky-400" />
              监控中心
            </h1>
            <p className="text-zinc-400 mt-2 text-sm">实时监控工作流执行状态与容器资源占用情况。</p>
          </div>

          {/* Metrics Overview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-zinc-950/50 border border-white/[0.05] rounded-xl p-5 backdrop-blur-md">
              <div className="flex items-center gap-3 text-zinc-400 mb-2">
                <Server className="w-4 h-4" />
                <span className="text-sm font-medium">活跃容器数</span>
              </div>
              <div className="text-3xl font-bold text-zinc-100">12<span className="text-sm text-zinc-500 font-normal ml-2">/ 20</span></div>
            </div>
            <div className="bg-zinc-950/50 border border-white/[0.05] rounded-xl p-5 backdrop-blur-md">
              <div className="flex items-center gap-3 text-zinc-400 mb-2">
                <Cpu className="w-4 h-4" />
                <span className="text-sm font-medium">CPU 总使用率</span>
              </div>
              <div className="text-3xl font-bold text-sky-400">45%</div>
            </div>
            <div className="bg-zinc-950/50 border border-white/[0.05] rounded-xl p-5 backdrop-blur-md">
              <div className="flex items-center gap-3 text-zinc-400 mb-2">
                <MemoryStick className="w-4 h-4" />
                <span className="text-sm font-medium">内存总使用率</span>
              </div>
              <div className="text-3xl font-bold text-emerald-400">62%</div>
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-zinc-950/50 border border-white/[0.05] rounded-xl p-5 backdrop-blur-md">
              <h3 className="text-sm font-medium text-zinc-200 mb-6 flex items-center gap-2">
                <Cpu className="w-4 h-4 text-sky-400" />
                集群 CPU 占用趋势
              </h3>
              <div className="h-[250px] w-full">
                <ReactECharts option={cpuOption} style={{ height: '100%', width: '100%' }} />
              </div>
            </div>

            <div className="bg-zinc-950/50 border border-white/[0.05] rounded-xl p-5 backdrop-blur-md">
              <h3 className="text-sm font-medium text-zinc-200 mb-6 flex items-center gap-2">
                <MemoryStick className="w-4 h-4 text-emerald-400" />
                集群内存占用趋势
              </h3>
              <div className="h-[250px] w-full">
                <ReactECharts option={memoryOption} style={{ height: '100%', width: '100%' }} />
              </div>
            </div>
          </div>

          {/* Active Workflows */}
          <div>
            <h2 className="text-lg font-semibold text-zinc-100 mb-4">执行中工作流</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {activeWorkflows.map(wf => (
                <div key={wf.id} className="bg-zinc-950/80 border border-white/[0.08] rounded-xl overflow-hidden backdrop-blur-xl shadow-xl group hover:border-white/[0.15] transition-colors">
                  {/* Mock Real-time Screen */}
                  <div className="h-40 bg-zinc-900 relative overflow-hidden border-b border-white/[0.05]">
                    {wf.status === 'running' ? (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-full h-full opacity-20 bg-[url('https://images.unsplash.com/photo-1555066931-4365d14bab8c?q=80&w=1000&auto=format&fit=crop')] bg-cover bg-center"></div>
                        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 to-transparent"></div>
                        <div className="absolute flex flex-col items-center gap-3">
                          <div className="relative">
                            <div className="w-12 h-12 rounded-full border-2 border-sky-500/30 border-t-sky-500 animate-spin"></div>
                            <Play className="w-4 h-4 text-sky-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                          </div>
                          <span className="text-xs font-mono text-sky-400 bg-sky-500/10 px-2 py-1 rounded">实时画面捕获中...</span>
                        </div>
                      </div>
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center bg-emerald-950/20">
                        <CheckCircle2 className="w-10 h-10 text-emerald-500 opacity-50" />
                      </div>
                    )}
                  </div>
                  
                  <div className="p-5">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-sm font-semibold text-zinc-100">{wf.name}</h3>
                        <p className="text-xs text-zinc-500 mt-1 font-mono">{wf.container}</p>
                      </div>
                      <div className={cn(
                        "px-2 py-1 rounded text-[10px] font-medium uppercase tracking-wider flex items-center gap-1.5",
                        wf.status === 'running' ? "bg-sky-500/10 text-sky-400 border border-sky-500/20" : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                      )}>
                        {wf.status === 'running' && <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse"></span>}
                        {wf.status === 'running' ? 'Running' : 'Success'}
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      <div>
                        <div className="flex justify-between text-xs mb-1.5">
                          <span className="text-zinc-500">当前节点</span>
                          <span className="text-zinc-300">{wf.step}</span>
                        </div>
                        <div className="h-1.5 w-full bg-zinc-900 rounded-full overflow-hidden">
                          <div className={cn(
                            "h-full rounded-full transition-all duration-1000",
                            wf.status === 'running' ? "w-2/3 bg-sky-500" : "w-full bg-emerald-500"
                          )}></div>
                        </div>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-zinc-500">已运行时间</span>
                        <span className="text-zinc-300 font-mono">{wf.duration}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
