import {
  ArrowDownToLine,
  Camera,
  Clock,
  Database,
  GitBranch,
  Globe,
  LucideIcon,
  MousePointer2,
  MousePointerClick,
  Search,
  Type,
} from "lucide-react";

export interface NodeField {
  name: string;
  label: string;
  type: "text" | "number" | "select";
  placeholder?: string;
  defaultValue?: string;
  options?: { label: string; value: string }[];
}

export interface NodeDefinition {
  type: string;
  label: string;
  category: string;
  icon: LucideIcon;
  color: string;
  bgGradient: string;
  fields: NodeField[];
}

export const nodeRegistry: NodeDefinition[] = [
  {
    type: "open_page",
    label: "打开网页",
    category: "网页交互",
    icon: Globe,
    color: "text-blue-400 bg-blue-400/10 border-blue-400/20",
    bgGradient: "from-blue-500/10",
    fields: [{ name: "url", label: "目标 URL", type: "text", placeholder: "https://..." }],
  },
  {
    type: "click",
    label: "点击元素",
    category: "网页交互",
    icon: MousePointerClick,
    color: "text-amber-400 bg-amber-400/10 border-amber-400/20",
    bgGradient: "from-amber-500/10",
    fields: [{ name: "selector", label: "CSS 选择器", type: "text", placeholder: "#id 或 .class" }],
  },
  {
    type: "input",
    label: "输入文本",
    category: "网页交互",
    icon: Type,
    color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
    bgGradient: "from-emerald-500/10",
    fields: [
      { name: "selector", label: "CSS 选择器", type: "text", placeholder: "#id 或 .class" },
      { name: "value", label: "输入内容", type: "text" },
    ],
  },
  {
    type: "hover",
    label: "悬停元素",
    category: "网页交互",
    icon: MousePointer2,
    color: "text-cyan-400 bg-cyan-400/10 border-cyan-400/20",
    bgGradient: "from-cyan-500/10",
    fields: [{ name: "selector", label: "CSS 选择器", type: "text", placeholder: "#id 或 .class" }],
  },
  {
    type: "scroll",
    label: "滚动页面",
    category: "网页交互",
    icon: ArrowDownToLine,
    color: "text-orange-400 bg-orange-400/10 border-orange-400/20",
    bgGradient: "from-orange-500/10",
    fields: [
      {
        name: "direction",
        label: "滚动方向",
        type: "select",
        defaultValue: "down",
        options: [
          { label: "向下滚动", value: "down" },
          { label: "向上滚动", value: "up" },
          { label: "滚动到底部", value: "bottom" },
          { label: "滚动到顶部", value: "top" },
        ],
      },
      { name: "distance", label: "滚动距离 (px)", type: "number", defaultValue: "500" },
    ],
  },
  {
    type: "extract",
    label: "提取数据",
    category: "数据提取",
    icon: Search,
    color: "text-purple-400 bg-purple-400/10 border-purple-400/20",
    bgGradient: "from-purple-500/10",
    fields: [
      { name: "selector", label: "CSS 选择器", type: "text", placeholder: "#id 或 .class" },
      {
        name: "property",
        label: "提取属性",
        type: "select",
        defaultValue: "text",
        options: [
          { label: "文本内容 (innerText)", value: "text" },
          { label: "HTML 内容 (innerHTML)", value: "html" },
          { label: "链接地址 (href)", value: "href" },
          { label: "图片地址 (src)", value: "src" },
        ],
      },
    ],
  },
  {
    type: "screenshot",
    label: "网页截图",
    category: "数据提取",
    icon: Camera,
    color: "text-pink-400 bg-pink-400/10 border-pink-400/20",
    bgGradient: "from-pink-500/10",
    fields: [
      {
        name: "scope",
        label: "截图范围",
        type: "select",
        defaultValue: "viewport",
        options: [
          { label: "当前视口", value: "viewport" },
          { label: "整个页面", value: "full" },
        ],
      },
    ],
  },
  {
    type: "save",
    label: "保存数据",
    category: "数据提取",
    icon: Database,
    color: "text-indigo-400 bg-indigo-400/10 border-indigo-400/20",
    bgGradient: "from-indigo-500/10",
    fields: [
      {
        name: "target",
        label: "保存目标",
        type: "select",
        defaultValue: "database",
        options: [
          { label: "系统数据库", value: "database" },
          { label: "导出为 CSV", value: "csv" },
          { label: "导出为 JSON", value: "json" },
        ],
      },
    ],
  },
  {
    type: "condition",
    label: "条件判断",
    category: "流程控制",
    icon: GitBranch,
    color: "text-rose-400 bg-rose-400/10 border-rose-400/20",
    bgGradient: "from-rose-500/10",
    fields: [
      {
        name: "condition",
        label: "判断条件",
        type: "select",
        defaultValue: "element_exists",
        options: [
          { label: "元素存在", value: "element_exists" },
          { label: "文本包含", value: "text_contains" },
          { label: "URL 包含", value: "url_contains" },
        ],
      },
      { name: "targetValue", label: "目标值", type: "text", placeholder: "输入选择器或文本..." },
    ],
  },
  {
    type: "wait",
    label: "等待时间",
    category: "流程控制",
    icon: Clock,
    color: "text-zinc-400 bg-zinc-400/10 border-zinc-400/20",
    bgGradient: "from-zinc-500/10",
    fields: [{ name: "time", label: "等待时间 (毫秒)", type: "number", defaultValue: "1000" }],
  },
];

export const getNodeDefinition = (type: string): NodeDefinition | undefined => {
  return nodeRegistry.find((node) => node.type === type);
};
