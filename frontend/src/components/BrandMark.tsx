import { cn } from "@/src/lib/utils";

interface BrandMarkProps {
  className?: string;
  compact?: boolean;
}

export function BrandMark({ className, compact = false }: BrandMarkProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-sky-300/20 bg-[linear-gradient(145deg,rgba(8,19,38,0.96),rgba(4,9,18,0.96))] shadow-[0_14px_40px_rgba(8,145,178,0.22)]",
        compact ? "h-10 w-10" : "h-12 w-12",
        className,
      )}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_18%,rgba(125,211,252,0.3),transparent_36%),radial-gradient(circle_at_82%_24%,rgba(45,212,191,0.2),transparent_30%),radial-gradient(circle_at_48%_86%,rgba(163,230,53,0.18),transparent_34%)]" />
      <svg
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="absolute inset-[8px]"
        aria-hidden="true"
      >
        <path
          d="M17 42C17 31.5066 25.5066 23 36 23H47"
          stroke="url(#cloudflow-line)"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <path
          d="M19 22H31C39.8366 22 47 29.1634 47 38V47"
          stroke="rgba(148,163,184,0.38)"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
        <circle cx="17" cy="42" r="5.5" fill="#7DD3FC" />
        <circle cx="47" cy="23" r="5.5" fill="#2DD4BF" />
        <circle cx="47" cy="47" r="5.5" fill="#A3E635" />
        <defs>
          <linearGradient id="cloudflow-line" x1="17" y1="23" x2="47" y2="47" gradientUnits="userSpaceOnUse">
            <stop stopColor="#7DD3FC" />
            <stop offset="0.52" stopColor="#2DD4BF" />
            <stop offset="1" stopColor="#A3E635" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}
