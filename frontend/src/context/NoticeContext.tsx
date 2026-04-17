import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "@/src/lib/utils";

type NoticeTone = "success" | "error" | "info" | "warning";

interface NoticeInput {
  title: string;
  description?: string;
  tone?: NoticeTone;
  durationMs?: number;
}

interface NoticeRecord extends NoticeInput {
  id: string;
  tone: NoticeTone;
}

interface NoticeContextValue {
  notify: (input: NoticeInput) => void;
}

const NoticeContext = createContext<NoticeContextValue | undefined>(undefined);

function getToneMeta(tone: NoticeTone) {
  switch (tone) {
    case "success":
      return {
        icon: CheckCircle2,
        shellClassName: "border-emerald-500/20 bg-emerald-500/10 text-emerald-50",
        iconClassName: "border-emerald-400/20 bg-emerald-500/15 text-emerald-200",
      };
    case "error":
      return {
        icon: XCircle,
        shellClassName: "border-red-500/20 bg-red-500/10 text-red-50",
        iconClassName: "border-red-400/20 bg-red-500/15 text-red-200",
      };
    case "warning":
      return {
        icon: AlertTriangle,
        shellClassName: "border-amber-500/20 bg-amber-500/10 text-amber-50",
        iconClassName: "border-amber-400/20 bg-amber-500/15 text-amber-200",
      };
    default:
      return {
        icon: Info,
        shellClassName: "border-sky-500/20 bg-sky-500/10 text-sky-50",
        iconClassName: "border-sky-400/20 bg-sky-500/15 text-sky-200",
      };
  }
}

export function NoticeProvider({ children }: { children: ReactNode }) {
  const [notices, setNotices] = useState<NoticeRecord[]>([]);

  const dismiss = useCallback((id: string) => {
    setNotices((current) => current.filter((item) => item.id !== id));
  }, []);

  const notify = useCallback((input: NoticeInput) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const tone = input.tone ?? "info";

    setNotices((current) => [
      ...current,
      {
        ...input,
        id,
        tone,
      },
    ]);

    const durationMs = input.durationMs ?? 4200;
    window.setTimeout(() => {
      setNotices((current) => current.filter((item) => item.id !== id));
    }, durationMs);
  }, []);

  const value = useMemo<NoticeContextValue>(
    () => ({
      notify,
    }),
    [notify],
  );

  useEffect(
    () => () => {
      setNotices([]);
    },
    [],
  );

  return (
    <NoticeContext.Provider value={value}>
      {children}

      <div className="pointer-events-none fixed right-4 top-4 z-[90] flex w-[min(420px,calc(100vw-2rem))] flex-col gap-3">
        {notices.map((notice) => {
          const meta = getToneMeta(notice.tone);
          const Icon = meta.icon;

          return (
            <div
              key={notice.id}
              className={cn(
                "pointer-events-auto rounded-2xl border px-4 py-4 shadow-[0_20px_50px_rgba(0,0,0,0.35)] backdrop-blur-xl",
                meta.shellClassName,
              )}
            >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border",
                    meta.iconClassName,
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">{notice.title}</div>
                  {notice.description ? (
                    <div className="mt-1 text-sm leading-6 text-white/75">{notice.description}</div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(notice.id)}
                  className="rounded-full p-1 text-white/55 transition-colors hover:bg-white/10 hover:text-white"
                  aria-label="关闭通知"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </NoticeContext.Provider>
  );
}

export function useNotice() {
  const context = useContext(NoticeContext);
  if (!context) {
    throw new Error("useNotice must be used within NoticeProvider");
  }

  return context;
}
