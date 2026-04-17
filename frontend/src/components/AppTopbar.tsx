import type { ReactNode } from "react";
import { useEffect } from "react";
import { buildPageTitle } from "@/src/lib/brand";
import { cn } from "@/src/lib/utils";
import { TopbarAccount } from "./TopbarAccount";

interface AppTopbarProps {
  title: string;
  subtitle: string;
  badge?: string;
  actions?: ReactNode;
  className?: string;
}

export function AppTopbar({ title, subtitle, badge, actions, className }: AppTopbarProps) {
  const normalizedTitle = badge === "Scheduler" ? "个人中心" : title;
  const normalizedSubtitle =
    badge === "Scheduler"
      ? "这里可以维护昵称、修改密码，并集中管理你自己的定时调度与告警设置。"
      : subtitle;
  const normalizedBadge = badge === "Scheduler" ? "Account" : badge;

  useEffect(() => {
    document.title = buildPageTitle(normalizedTitle);
  }, [normalizedTitle]);

  return (
    <div className={cn("border-b border-white/[0.05] bg-zinc-950/88 px-5 py-3 backdrop-blur-md", className)}>
      <div className="mx-auto flex w-full flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-lg font-semibold tracking-[0.02em] text-zinc-100">{normalizedTitle}</h1>
            {normalizedBadge ? (
              <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-sky-200">
                {normalizedBadge}
              </span>
            ) : null}
          </div>
          <div className="mt-1 text-sm text-zinc-400">{normalizedSubtitle}</div>
        </div>

        <div className="flex min-w-0 items-center justify-end gap-2">
          {actions ? <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">{actions}</div> : null}
          <TopbarAccount />
        </div>
      </div>
    </div>
  );
}
