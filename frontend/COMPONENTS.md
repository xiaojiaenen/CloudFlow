# CLOUDFLOW 组件库文档 (Component Library)

本文档记录了 CLOUDFLOW 项目中提取的可复用 UI 组件。所有组件均位于 `src/components/ui/` 目录下，采用 Tailwind CSS 进行样式定制，并支持深色高级质感主题。

## 核心设计规范 (Design System)

- **主背景色**: `#09090b` (zinc-950)，搭配顶部的径向渐变光晕 (`radial-gradient`)，营造深邃的空间感。
- **边框**: 统一使用 `border-white/[0.05]` 或 `border-white/[0.08]`，保持极简锐利。
- **强调色**: 采用 Sky Blue (`#0ea5e9`) 作为主强调色，用于激活状态、按钮和发光效果。
- **毛玻璃 (Glassmorphism)**: 卡片、侧边栏和浮动面板大量使用 `bg-zinc-950/50 backdrop-blur-xl` 或 `bg-zinc-950/80 backdrop-blur-md`。
- **动画**: 使用自定义的 `animate-breathe` (呼吸灯效果) 强调运行中的节点。

---

## 基础组件 (Base Components)

### 1. Button (按钮)
**路径**: `src/components/ui/Button.tsx`
**描述**: 核心交互按钮组件，基于 `class-variance-authority` (cva) 构建，支持多种变体和尺寸。
- **变体 (Variants)**: `default` (默认实心), `destructive` (危险操作), `outline` (线框), `secondary` (次要), `ghost` (幽灵/透明), `link` (链接)。
- **尺寸 (Sizes)**: `default`, `sm`, `lg`, `icon`。

### 2. Input (输入框)
**路径**: `src/components/ui/Input.tsx`
**描述**: 基础文本输入组件，带有深色模式的边框、背景和聚焦状态 (`focus-visible:ring-sky-500`)。

### 3. Card (卡片)
**路径**: `src/components/ui/Card.tsx`
**描述**: 容器组件套件，用于包裹独立的内容块。采用了 `backdrop-blur` 和低透明度背景，实现高级毛玻璃质感。
- **子组件**: `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`。

### 4. Badge (徽章)
**路径**: `src/components/ui/Badge.tsx`
**描述**: 用于显示状态、标签或计数的微型组件。支持 `default`, `secondary`, `destructive`, `outline` 变体。

---

## 数据展示组件 (Data Display)

### 5. Table (表格)
**路径**: `src/components/ui/Table.tsx`
**描述**: 完整的数据表格组件集，支持悬浮高亮和极简边框。
- **子组件**: `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`, `TableCaption`。

---

## 导航与布局组件 (Navigation & Layout)

### 6. Tabs (标签页)
**路径**: `src/components/ui/Tabs.tsx`
**描述**: 用于在不同视图间切换的标签页组件。基于 Radix UI 的无头组件模式构建（当前为简化版实现）。
- **子组件**: `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`。

### 7. Dialog (对话框/模态框)
**路径**: `src/components/ui/Dialog.tsx`
**描述**: 覆盖在主内容之上的模态窗口，用于重要提示或复杂表单输入。包含半透明遮罩层。
- **子组件**: `Dialog`, `DialogTrigger`, `DialogContent`, `DialogHeader`, `DialogFooter`, `DialogTitle`, `DialogDescription`。

---

## 表单组件 (Form Controls)

### 8. Switch (开关)
**路径**: `src/components/ui/Switch.tsx`
**描述**: 拨动开关组件，常用于设置页面的布尔值配置。激活状态使用 Sky Blue 强调色。

---

## 业务组件 (Domain Components)

### 9. NodePalette (节点面板)
**路径**: `src/components/NodePalette.tsx`
**描述**: 工作流编辑器左侧的节点拖拽面板。包含所有支持的节点类型（Navigate, Click, Type, Extract, Condition 等），支持 HTML5 Drag and Drop API。

### 10. NodeCard (节点卡片)
**路径**: `src/components/NodeCard.tsx`
**描述**: React Flow 画布中渲染的自定义节点组件。
- **特性**: 
  - 根据节点类型渲染不同的图标和颜色。
  - 支持显示节点状态（idle, running, success, error）并附带呼吸灯动画。
  - 对于 `condition` (条件判断) 节点，渲染两个输出句柄 (True/False)。
  - 采用毛玻璃质感背景。

### 11. NodeConfigPanel (节点配置面板)
**路径**: `src/components/NodeConfigPanel.tsx`
**描述**: 选中节点时在右侧弹出的配置面板。根据不同的节点类型动态渲染相应的表单项（如 URL 输入框、CSS 选择器、提取属性下拉菜单等）。