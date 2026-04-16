import type { ReactNode } from "react";
import { useEffect } from "react";
import { BRAND, buildPageTitle } from "@/src/lib/brand";
import { cn } from "@/src/lib/utils";
import { BrandMark } from "./BrandMark";
import { TopbarAccount } from "./TopbarAccount";

interface AppTopbarProps {
  title: string;
  subtitle: string;
  badge?: string;
  actions?: ReactNode;
  className?: string;
}

export function AppTopbar({ title, subtitle, badge, actions, className }: AppTopbarProps) {
  useEffect(() => {
    document.title = buildPageTitle(title);
  }, [title]);

  return (
    <div className={cn("border-b border-white/[0.06] bg-zinc-950/75 px-5 py-3 backdrop-blur-xl", className)}>
      <div className="mx-auto flex w-full flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <BrandMark compact />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-lg font-semibold tracking-[0.03em] text-zinc-100">{title}</h1>
              {badge ? (
                <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.22em] text-sky-200">
                  {badge}
                </span>
              ) : null}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
              <span className="font-medium tracking-[0.24em] text-zinc-500">{BRAND.name}</span>
              <span className="hidden h-1 w-1 rounded-full bg-zinc-700 sm:inline-flex" />
              <span className="line-clamp-1">{subtitle}</span>
            </div>
          </div>
        </div>

        <div className="flex min-w-0 items-center justify-end gap-2">
          {actions ? <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">{actions}</div> : null}
          <TopbarAccount />
        </div>
      </div>
    </div>
  );
}
