import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { cn } from "@/src/lib/utils";

export function Dialog({
  open,
  onOpenChange,
  children,
  className,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="fixed inset-0 bg-[radial-gradient(circle_at_top,rgba(14,165,233,0.12),transparent_30%),rgba(2,6,23,0.84)] backdrop-blur-md"
            onClick={() => onOpenChange?.(false)}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 12 }}
            transition={{ duration: 0.24, ease: "easeOut" }}
            className={cn(
              "relative z-50 flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-[28px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(8,10,15,0.98))] shadow-[0_32px_90px_rgba(0,0,0,0.55)]",
              className,
            )}
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.12),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(163,230,53,0.08),transparent_28%)]" />
            {children}
            <button
              type="button"
              onClick={() => onOpenChange?.(false)}
              className="absolute right-4 top-4 z-10 rounded-full border border-white/[0.08] bg-black/20 p-2 text-zinc-400 transition-colors hover:border-white/[0.16] hover:text-zinc-100"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </button>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("relative border-b border-white/[0.06] px-6 py-5 text-center sm:text-left", className)}
      {...props}
    />
  );
}

export function DialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-xl font-semibold tracking-tight text-zinc-100", className)} {...props} />;
}

export function DialogDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("mt-2 text-sm leading-6 text-zinc-400", className)} {...props} />;
}

export function DialogContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("relative overflow-y-auto px-6 py-6", className)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("relative flex items-center justify-end gap-3 border-t border-white/[0.06] px-6 py-4", className)}
      {...props}
    />
  );
}
