import * as React from "react"
import { cn } from "@/src/lib/utils"

const TabsContext = React.createContext<{ value: string; onValueChange: (v: string) => void } | null>(null)

export function Tabs({ defaultValue, value, onValueChange, children, className }: { defaultValue?: string, value?: string, onValueChange?: (v: string) => void, children: React.ReactNode, className?: string }) {
  const [tab, setTab] = React.useState(value || defaultValue || "")
  
  const handleValueChange = (v: string) => {
    setTab(v)
    onValueChange?.(v)
  }
  
  return (
    <TabsContext.Provider value={{ value: value !== undefined ? value : tab, onValueChange: handleValueChange }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  )
}

export function TabsList({ children, className }: { children: React.ReactNode, className?: string }) {
  return (
    <div className={cn("inline-flex h-10 items-center justify-center rounded-lg bg-zinc-900/80 p-1 text-zinc-400 border border-white/[0.05]", className)}>
      {children}
    </div>
  )
}

export function TabsTrigger({ value, children, className }: { value: string, children: React.ReactNode, className?: string }) {
  const ctx = React.useContext(TabsContext)
  const isActive = ctx?.value === value
  
  return (
    <button 
      onClick={() => ctx?.onValueChange(value)} 
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-all focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50", 
        isActive ? "bg-zinc-800 text-zinc-100 shadow-sm" : "hover:bg-zinc-800/50 hover:text-zinc-200", 
        className
      )}
    >
      {children}
    </button>
  )
}

export function TabsContent({ value, children, className }: { value: string, children: React.ReactNode, className?: string }) {
  const ctx = React.useContext(TabsContext)
  if (ctx?.value !== value) return null
  return (
    <div className={cn("mt-4 focus-visible:outline-none", className)}>
      {children}
    </div>
  )
}
