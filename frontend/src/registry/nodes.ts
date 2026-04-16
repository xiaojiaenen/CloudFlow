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
  description?: string;
  options?: { label: string; value: string }[];
}

export interface NodeDefinition {
  type: string;
  label: string;
  description?: string;
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
    description: "访问目标网址，作为后续浏览器操作的起点。",
    category: "浏览器导航",
    icon: Globe,
    color: "text-blue-400 bg-blue-400/10 border-blue-400/20",
    bgGradient: "from-blue-500/10",
    fields: [
      {
        name: "url",
        label: "页面地址",
        type: "text",
        placeholder: "https://example.com",
        description: "支持直接填写 URL，也支持引用运行参数或凭据模板变量。",
      },
    ],
  },
  {
    type: "wait_for_url",
    label: "等待 URL",
    description: "等待页面跳转或加载到指定状态。",
    category: "浏览器导航",
    icon: Waypoints,
    color: "text-sky-400 bg-sky-400/10 border-sky-400/20",
    bgGradient: "from-sky-500/10",
    fields: [
      {
        name: "urlIncludes",
        label: "URL 包含",
        type: "text",
        placeholder: "/dashboard",
        description: "留空时只等待页面加载阶段；填写后会继续等待 URL 包含指定文本。",
      },
      {
        name: "waitUntil",
        label: "等待阶段",
        type: "select",
        defaultValue: "load",
        options: [
          { label: "页面 load 完成", value: "load" },
          { label: "DOM 就绪", value: "domcontentloaded" },
          { label: "网络空闲", value: "networkidle" },
          { label: "收到首个响应", value: "commit" },
        ],
      },
      {
        name: "timeout",
        label: "超时（毫秒）",
        type: "number",
        defaultValue: "10000",
      },
    ],
  },
  {
    type: "click",
    label: "点击元素",
    description: "点击按钮、链接或任意可交互元素。",
    category: "元素交互",
    icon: MousePointerClick,
    color: "text-amber-400 bg-amber-400/10 border-amber-400/20",
    bgGradient: "from-amber-500/10",
    fields: [
      {
        name: "selector",
        label: "元素选择器",
        type: "text",
        placeholder: "#login-button",
        description: "建议优先使用稳定的 id、name、data-testid 等定位方式。",
      },
    ],
  },
  {
    type: "hover",
    label: "悬停元素",
    description: "把鼠标移动到指定元素上，常用于触发下拉菜单或浮层。",
    category: "元素交互",
    icon: MousePointer2,
    color: "text-cyan-400 bg-cyan-400/10 border-cyan-400/20",
    bgGradient: "from-cyan-500/10",
    fields: [{ name: "selector", label: "元素选择器", type: "text", placeholder: ".menu-item" }],
  },
  {
    type: "input",
    label: "输入内容",
    description: "向输入框、文本域等控件写入内容。",
    category: "元素交互",
    icon: Type,
    color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
    bgGradient: "from-emerald-500/10",
    fields: [
      { name: "selector", label: "输入框选择器", type: "text", placeholder: "#username" },
      {
        name: "value",
        label: "输入值",
        type: "text",
        placeholder: "{{inputs.username}}",
        description: "支持手动输入，也支持引用运行参数、变量或凭据字段。",
      },
    ],
  },
  {
    type: "press_key",
    label: "按下按键",
    description: "触发键盘按键，例如 Enter、Tab、Escape。",
    category: "元素交互",
    icon: Keyboard,
    color: "text-violet-400 bg-violet-400/10 border-violet-400/20",
    bgGradient: "from-violet-500/10",
    fields: [{ name: "key", label: "按键", type: "text", placeholder: "Enter / Tab / Escape" }],
  },
  {
    type: "select_option",
    label: "选择下拉项",
    description: "选择原生 select 下拉框中的选项值。",
    category: "元素交互",
    icon: BetweenHorizontalEnd,
    color: "text-fuchsia-400 bg-fuchsia-400/10 border-fuchsia-400/20",
    bgGradient: "from-fuchsia-500/10",
    fields: [
      { name: "selector", label: "下拉框选择器", type: "text", placeholder: "select[name='status']" },
      { name: "value", label: "选项值", type: "text", placeholder: "approved" },
    ],
  },
  {
    type: "check",
    label: "勾选复选框",
    description: "勾选复选框或开关。",
    category: "元素交互",
    icon: CheckSquare,
    color: "text-lime-400 bg-lime-400/10 border-lime-400/20",
    bgGradient: "from-lime-500/10",
    fields: [{ name: "selector", label: "复选框选择器", type: "text", placeholder: "input[type='checkbox']" }],
  },
  {
    type: "uncheck",
    label: "取消勾选",
    description: "取消勾选复选框或开关。",
    category: "元素交互",
    icon: SquareMousePointer,
    color: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
    bgGradient: "from-yellow-500/10",
    fields: [{ name: "selector", label: "复选框选择器", type: "text", placeholder: "input[type='checkbox']" }],
  },
  {
    type: "set_variable",
    label: "设置变量",
    description: "把当前值保存为流程变量，供后续节点引用。",
    category: "流程控制",
    icon: Type,
    color: "text-indigo-300 bg-indigo-300/10 border-indigo-300/20",
    bgGradient: "from-indigo-400/10",
    fields: [
      { name: "key", label: "变量名", type: "text", placeholder: "statusText" },
      {
        name: "value",
        label: "变量值",
        type: "text",
        placeholder: "{{inputs.keyword}}",
        description: "支持固定文本，也支持引用运行参数、凭据和已有变量。",
      },
    ],
  },
  {
    type: "condition",
    label: "条件分支",
    description: "根据比较结果走 true / false 两条分支。",
    category: "流程控制",
    icon: Waypoints,
    color: "text-rose-300 bg-rose-300/10 border-rose-300/20",
    bgGradient: "from-rose-400/10",
    fields: [
      { name: "left", label: "左值", type: "text", placeholder: "{{variables.status}}" },
      {
        name: "operator",
        label: "比较方式",
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
          { label: "非空", value: "not_empty" },
        ],
      },
      { name: "right", label: "右值", type: "text", placeholder: "success" },
    ],
  },
  {
    type: "wait",
    label: "固定等待",
    description: "按照指定时长暂停执行。",
    category: "等待与上下文",
    icon: Clock,
    color: "text-zinc-400 bg-zinc-400/10 border-zinc-400/20",
    bgGradient: "from-zinc-500/10",
    fields: [{ name: "time", label: "等待时长（毫秒）", type: "number", defaultValue: "1000" }],
  },
  {
    type: "wait_for_element",
    label: "等待元素",
    description: "等待元素出现、隐藏、挂载或移除。",
    category: "等待与上下文",
    icon: ScanSearch,
    color: "text-teal-400 bg-teal-400/10 border-teal-400/20",
    bgGradient: "from-teal-500/10",
    fields: [
      {
        name: "selector",
        label: "目标元素选择器",
        type: "text",
        placeholder: ".result-card",
        description: "建议尽量使用唯一且稳定的定位方式。",
      },
      {
        name: "state",
        label: "等待状态",
        type: "select",
        defaultValue: "visible",
        options: [
          { label: "元素可见", value: "visible" },
          { label: "已挂载到 DOM", value: "attached" },
          { label: "元素隐藏", value: "hidden" },
          { label: "已从 DOM 移除", value: "detached" },
        ],
      },
      { name: "timeout", label: "超时（毫秒）", type: "number", defaultValue: "10000" },
    ],
  },
  {
    type: "wait_for_text",
    label: "等待文本",
    description: "等待元素文本满足指定条件，例如包含、等于或非空。",
    category: "等待与上下文",
    icon: Type,
    color: "text-cyan-300 bg-cyan-300/10 border-cyan-300/20",
    bgGradient: "from-cyan-400/10",
    fields: [
      { name: "selector", label: "目标元素选择器", type: "text", placeholder: ".status-label" },
      {
        name: "text",
        label: "目标文本",
        type: "text",
        placeholder: "处理完成",
        description: "当匹配方式为“文本非空”时，这个字段可以留空。",
      },
      {
        name: "matchMode",
        label: "匹配方式",
        type: "select",
        defaultValue: "contains",
        options: [
          { label: "包含指定文本", value: "contains" },
          { label: "完全等于", value: "equals" },
          { label: "不包含指定文本", value: "not_contains" },
          { label: "不等于指定文本", value: "not_equals" },
          { label: "文本非空", value: "not_empty" },
        ],
      },
      { name: "timeout", label: "超时（毫秒）", type: "number", defaultValue: "10000" },
    ],
  },
  {
    type: "wait_for_class",
    label: "等待 class",
    description: "等待元素 class 包含或不包含指定类名。",
    category: "等待与上下文",
    icon: CheckSquare,
    color: "text-emerald-300 bg-emerald-300/10 border-emerald-300/20",
    bgGradient: "from-emerald-400/10",
    fields: [
      { name: "selector", label: "目标元素选择器", type: "text", placeholder: ".submit-button" },
      { name: "className", label: "class 名称", type: "text", placeholder: "is-active" },
      {
        name: "condition",
        label: "判断方式",
        type: "select",
        defaultValue: "contains",
        options: [
          { label: "包含该 class", value: "contains" },
          { label: "不包含该 class", value: "not_contains" },
        ],
      },
      { name: "timeout", label: "超时（毫秒）", type: "number", defaultValue: "10000" },
    ],
  },
  {
    type: "switch_iframe",
    label: "切换 iframe",
    description: "切换到指定 iframe，后续节点都在该 frame 内执行。",
    category: "等待与上下文",
    icon: Frame,
    color: "text-indigo-400 bg-indigo-400/10 border-indigo-400/20",
    bgGradient: "from-indigo-500/10",
    fields: [
      {
        name: "selector",
        label: "iframe 选择器",
        type: "text",
        placeholder: "iframe[name='content-frame']",
        description: "优先使用选择器定位；和 iframe 名称、URL 包含三者满足其一即可。",
      },
      { name: "name", label: "iframe 名称", type: "text", placeholder: "content-frame" },
      { name: "urlIncludes", label: "iframe URL 包含", type: "text", placeholder: "/embed/" },
      { name: "timeout", label: "超时（毫秒）", type: "number", defaultValue: "10000" },
    ],
  },
  {
    type: "switch_main_frame",
    label: "回到主文档",
    description: "从当前 iframe 返回主页面文档。",
    category: "等待与上下文",
    icon: Frame,
    color: "text-zinc-300 bg-zinc-300/10 border-zinc-300/20",
    bgGradient: "from-zinc-400/10",
    fields: [],
  },
  {
    type: "scroll",
    label: "滚动页面",
    description: "向上、向下，或直接滚到顶部/底部。",
    category: "等待与上下文",
    icon: ArrowDownToLine,
    color: "text-orange-300 bg-orange-300/10 border-orange-300/20",
    bgGradient: "from-orange-400/10",
    fields: [
      {
        name: "direction",
        label: "滚动方向",
        type: "select",
        defaultValue: "down",
        options: [
          { label: "向下滚动", value: "down" },
          { label: "向上滚动", value: "up" },
          { label: "滚到底部", value: "bottom" },
          { label: "滚到顶部", value: "top" },
        ],
      },
      {
        name: "distance",
        label: "滚动距离（像素）",
        type: "number",
        defaultValue: "500",
        description: "仅在“向上/向下滚动”时生效。",
      },
    ],
  },
  {
    type: "extract",
    label: "提取内容",
    description: "从页面读取文本、属性或 HTML，并保存到变量里。",
    category: "数据采集",
    icon: ArrowDownToLine,
    color: "text-emerald-300 bg-emerald-300/10 border-emerald-300/20",
    bgGradient: "from-emerald-400/10",
    fields: [
      { name: "selector", label: "目标元素选择器", type: "text", placeholder: ".price-value" },
      {
        name: "property",
        label: "提取内容",
        type: "select",
        defaultValue: "text",
        options: [
          { label: "文本 text", value: "text" },
          { label: "HTML", value: "html" },
          { label: "链接 href", value: "href" },
          { label: "图片 src", value: "src" },
          { label: "输入值 value", value: "value" },
          { label: "指定属性", value: "attribute" },
        ],
      },
      {
        name: "attributeName",
        label: "属性名",
        type: "text",
        placeholder: "data-id",
        description: "仅当提取内容为“指定属性”时需要填写。",
      },
      {
        name: "saveAs",
        label: "保存为变量",
        type: "text",
        placeholder: "priceText",
        description: "提取结果会写入 `{{variables.priceText}}`。",
      },
    ],
  },
  {
    type: "screenshot",
    label: "截图",
    description: "主动对当前页面、整页或某个元素截图。",
    category: "数据采集",
    icon: Camera,
    color: "text-pink-300 bg-pink-300/10 border-pink-300/20",
    bgGradient: "from-pink-400/10",
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
      {
        name: "selector",
        label: "元素选择器",
        type: "text",
        placeholder: ".result-card",
        description: "当截图范围为“指定元素”时需要填写。",
      },
    ],
  },
];

export const getNodeDefinition = (type: string): NodeDefinition | undefined => {
  return nodeRegistry.find((node) => node.type === type);
};
