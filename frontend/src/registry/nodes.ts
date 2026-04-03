import {
  ArrowDownToLine,
  BetweenHorizontalEnd,
  Camera,
  CheckSquare,
  Clock,
  Frame,
  Globe,
  Keyboard,
  LucideIcon,
  MousePointer2,
  MousePointerClick,
  ScanSearch,
  Search,
  SquareMousePointer,
  Type,
  Waypoints,
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
    label: "打开页面",
    category: "浏览器导航",
    icon: Globe,
    color: "text-blue-400 bg-blue-400/10 border-blue-400/20",
    bgGradient: "from-blue-500/10",
    fields: [{ name: "url", label: "目标 URL", type: "text", placeholder: "https://example.com" }],
  },
  {
    type: "wait_for_url",
    label: "等待 URL",
    category: "浏览器导航",
    icon: Waypoints,
    color: "text-sky-400 bg-sky-400/10 border-sky-400/20",
    bgGradient: "from-sky-500/10",
    fields: [
      { name: "urlIncludes", label: "URL 包含", type: "text", placeholder: "/dashboard" },
      {
        name: "waitUntil",
        label: "等待时机",
        type: "select",
        defaultValue: "load",
        options: [
          { label: "load", value: "load" },
          { label: "domcontentloaded", value: "domcontentloaded" },
          { label: "networkidle", value: "networkidle" },
          { label: "commit", value: "commit" },
        ],
      },
      { name: "timeout", label: "超时毫秒", type: "number", defaultValue: "10000" },
    ],
  },
  {
    type: "click",
    label: "点击元素",
    category: "元素交互",
    icon: MousePointerClick,
    color: "text-amber-400 bg-amber-400/10 border-amber-400/20",
    bgGradient: "from-amber-500/10",
    fields: [{ name: "selector", label: "元素选择器", type: "text", placeholder: "#login-button" }],
  },
  {
    type: "hover",
    label: "悬停元素",
    category: "元素交互",
    icon: MousePointer2,
    color: "text-cyan-400 bg-cyan-400/10 border-cyan-400/20",
    bgGradient: "from-cyan-500/10",
    fields: [{ name: "selector", label: "元素选择器", type: "text", placeholder: ".menu-item" }],
  },
  {
    type: "input",
    label: "输入内容",
    category: "元素交互",
    icon: Type,
    color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
    bgGradient: "from-emerald-500/10",
    fields: [
      { name: "selector", label: "元素选择器", type: "text", placeholder: "#username" },
      { name: "value", label: "输入值", type: "text", placeholder: "{{inputs.username}}" },
    ],
  },
  {
    type: "press_key",
    label: "按下按键",
    category: "元素交互",
    icon: Keyboard,
    color: "text-violet-400 bg-violet-400/10 border-violet-400/20",
    bgGradient: "from-violet-500/10",
    fields: [{ name: "key", label: "按键", type: "text", placeholder: "Enter / Tab / Escape" }],
  },
  {
    type: "select_option",
    label: "选择下拉项",
    category: "元素交互",
    icon: BetweenHorizontalEnd,
    color: "text-fuchsia-400 bg-fuchsia-400/10 border-fuchsia-400/20",
    bgGradient: "from-fuchsia-500/10",
    fields: [
      { name: "selector", label: "元素选择器", type: "text", placeholder: "select[name='status']" },
      { name: "value", label: "选项值", type: "text", placeholder: "approved" },
    ],
  },
  {
    type: "check",
    label: "勾选复选框",
    category: "元素交互",
    icon: CheckSquare,
    color: "text-lime-400 bg-lime-400/10 border-lime-400/20",
    bgGradient: "from-lime-500/10",
    fields: [{ name: "selector", label: "元素选择器", type: "text", placeholder: "input[type='checkbox']" }],
  },
  {
    type: "uncheck",
    label: "取消勾选",
    category: "元素交互",
    icon: SquareMousePointer,
    color: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
    bgGradient: "from-yellow-500/10",
    fields: [{ name: "selector", label: "元素选择器", type: "text", placeholder: "input[type='checkbox']" }],
  },
  {
    type: "set_variable",
    label: "设置变量",
    category: "流程控制",
    icon: Type,
    color: "text-indigo-300 bg-indigo-300/10 border-indigo-300/20",
    bgGradient: "from-indigo-400/10",
    fields: [
      { name: "key", label: "变量名", type: "text", placeholder: "statusText" },
      { name: "value", label: "变量值", type: "text", placeholder: "{{inputs.keyword}}" },
    ],
  },
  {
    type: "condition",
    label: "条件分支",
    category: "流程控制",
    icon: Waypoints,
    color: "text-rose-300 bg-rose-300/10 border-rose-300/20",
    bgGradient: "from-rose-400/10",
    fields: [
      { name: "left", label: "左值", type: "text", placeholder: "{{variables.status}}" },
      {
        name: "operator",
        label: "条件",
        type: "select",
        defaultValue: "equals",
        options: [
          { label: "等于", value: "equals" },
          { label: "不等于", value: "not_equals" },
          { label: "包含", value: "contains" },
          { label: "不包含", value: "not_contains" },
          { label: "大于", value: "greater_than" },
          { label: "小于", value: "less_than" },
          { label: "为空", value: "is_empty" },
          { label: "不为空", value: "not_empty" },
        ],
      },
      { name: "right", label: "右值", type: "text", placeholder: "success" },
    ],
  },
  {
    type: "wait",
    label: "固定等待",
    category: "等待与上下文",
    icon: Clock,
    color: "text-zinc-400 bg-zinc-400/10 border-zinc-400/20",
    bgGradient: "from-zinc-500/10",
    fields: [{ name: "time", label: "等待毫秒", type: "number", defaultValue: "1000" }],
  },
  {
    type: "wait_for_element",
    label: "等待元素",
    category: "等待与上下文",
    icon: ScanSearch,
    color: "text-teal-400 bg-teal-400/10 border-teal-400/20",
    bgGradient: "from-teal-500/10",
    fields: [
      { name: "selector", label: "元素选择器", type: "text", placeholder: ".result-card" },
      {
        name: "state",
        label: "目标状态",
        type: "select",
        defaultValue: "visible",
        options: [
          { label: "visible", value: "visible" },
          { label: "attached", value: "attached" },
          { label: "hidden", value: "hidden" },
          { label: "detached", value: "detached" },
        ],
      },
      { name: "timeout", label: "超时毫秒", type: "number", defaultValue: "10000" },
    ],
  },
  {
    type: "wait_for_text",
    label: "等待文本",
    category: "等待与上下文",
    icon: Type,
    color: "text-cyan-300 bg-cyan-300/10 border-cyan-300/20",
    bgGradient: "from-cyan-400/10",
    fields: [
      { name: "selector", label: "元素选择器", type: "text", placeholder: ".status-label" },
      { name: "text", label: "目标文本", type: "text", placeholder: "处理完成" },
      {
        name: "matchMode",
        label: "匹配方式",
        type: "select",
        defaultValue: "contains",
        options: [
          { label: "包含文本", value: "contains" },
          { label: "完全等于", value: "equals" },
          { label: "不包含文本", value: "not_contains" },
          { label: "不等于", value: "not_equals" },
        ],
      },
      { name: "timeout", label: "超时毫秒", type: "number", defaultValue: "10000" },
    ],
  },
  {
    type: "wait_for_class",
    label: "等待 class",
    category: "等待与上下文",
    icon: CheckSquare,
    color: "text-emerald-300 bg-emerald-300/10 border-emerald-300/20",
    bgGradient: "from-emerald-400/10",
    fields: [
      { name: "selector", label: "元素选择器", type: "text", placeholder: ".submit-button" },
      { name: "className", label: "class 名", type: "text", placeholder: "is-active" },
      {
        name: "condition",
        label: "判断条件",
        type: "select",
        defaultValue: "contains",
        options: [
          { label: "包含该 class", value: "contains" },
          { label: "不包含该 class", value: "not_contains" },
        ],
      },
      { name: "timeout", label: "超时毫秒", type: "number", defaultValue: "10000" },
    ],
  },
  {
    type: "switch_iframe",
    label: "切换到 iframe",
    category: "等待与上下文",
    icon: Frame,
    color: "text-indigo-400 bg-indigo-400/10 border-indigo-400/20",
    bgGradient: "from-indigo-500/10",
    fields: [
      { name: "selector", label: "iframe 选择器", type: "text", placeholder: "iframe#iframe-login" },
      { name: "name", label: "iframe name", type: "text", placeholder: "login-frame" },
      { name: "urlIncludes", label: "iframe URL 包含", type: "text", placeholder: "/embedded" },
      { name: "timeout", label: "超时毫秒", type: "number", defaultValue: "10000" },
    ],
  },
  {
    type: "switch_main_frame",
    label: "切回主文档",
    category: "等待与上下文",
    icon: Frame,
    color: "text-slate-400 bg-slate-400/10 border-slate-400/20",
    bgGradient: "from-slate-500/10",
    fields: [],
  },
  {
    type: "scroll",
    label: "滚动页面",
    category: "页面操作",
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
          { label: "向下", value: "down" },
          { label: "向上", value: "up" },
          { label: "滚动到底部", value: "bottom" },
          { label: "滚动到顶部", value: "top" },
        ],
      },
      { name: "distance", label: "滚动距离(px)", type: "number", defaultValue: "500" },
    ],
  },
  {
    type: "extract",
    label: "提取数据",
    category: "数据采集",
    icon: Search,
    color: "text-purple-400 bg-purple-400/10 border-purple-400/20",
    bgGradient: "from-purple-500/10",
    fields: [
      { name: "selector", label: "元素选择器", type: "text", placeholder: ".product-title" },
      {
        name: "property",
        label: "提取属性",
        type: "select",
        defaultValue: "text",
        options: [
          { label: "文本", value: "text" },
          { label: "HTML", value: "html" },
          { label: "href", value: "href" },
          { label: "src", value: "src" },
          { label: "value", value: "value" },
          { label: "自定义 attribute", value: "attribute" },
        ],
      },
      { name: "attributeName", label: "属性名", type: "text", placeholder: "data-id" },
    ],
  },
  {
    type: "screenshot",
    label: "截图",
    category: "数据采集",
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
          { label: "整页", value: "full" },
          { label: "指定元素", value: "element" },
        ],
      },
      { name: "selector", label: "元素选择器", type: "text", placeholder: ".preview-card" },
    ],
  },
];

export const getNodeDefinition = (type: string): NodeDefinition | undefined => {
  return nodeRegistry.find((node) => node.type === type);
};
