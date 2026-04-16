import { cn } from "@/src/lib/utils";

interface InitialAvatarProps {
  name?: string | null;
  className?: string;
  textClassName?: string;
}

export function getInitialAvatarText(name?: string | null) {
  const normalized = name?.trim();
  if (!normalized) {
    return "U";
  }

  return normalized.charAt(0).toUpperCase();
}

export function InitialAvatar({ name, className, textClassName }: InitialAvatarProps) {
  return (
    <div
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-white/[0.08] bg-[linear-gradient(135deg,rgba(56,189,248,0.24),rgba(244,114,182,0.18))] text-sm font-semibold text-white shadow-[0_10px_30px_rgba(15,23,42,0.28)]",
        className,
      )}
      aria-hidden="true"
    >
      <span className={cn("leading-none", textClassName)}>{getInitialAvatarText(name)}</span>
    </div>
  );
}
