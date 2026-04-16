import * as React from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/src/lib/utils";

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  tone?: "default" | "danger";
  group?: string;
  keywords?: string[];
}

interface SelectProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  menuClassName?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyText?: string;
}

export const Select = React.forwardRef<HTMLButtonElement, SelectProps>(
  (
    {
      value,
      options,
      onChange,
      placeholder = "请选择",
      disabled = false,
      className,
      menuClassName,
      searchable = false,
      searchPlaceholder = "搜索选项",
      emptyText = "没有可选项",
    },
    ref,
  ) => {
    const [open, setOpen] = React.useState(false);
    const [keyword, setKeyword] = React.useState("");
    const rootRef = React.useRef<HTMLDivElement | null>(null);
    const buttonRef = React.useRef<HTMLButtonElement | null>(null);

    const mergedRef = React.useCallback(
      (node: HTMLButtonElement | null) => {
        buttonRef.current = node;
        if (typeof ref === "function") {
          ref(node);
        } else if (ref) {
          ref.current = node;
        }
      },
      [ref],
    );

    const selected = options.find((option) => option.value === value);

    React.useEffect(() => {
      if (!open) {
        setKeyword("");
        return;
      }

      const handlePointer = (event: MouseEvent) => {
        if (!rootRef.current?.contains(event.target as Node)) {
          setOpen(false);
        }
      };

      const handleEscape = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          setOpen(false);
          buttonRef.current?.focus();
        }
      };

      window.addEventListener("mousedown", handlePointer);
      window.addEventListener("keydown", handleEscape);

      return () => {
        window.removeEventListener("mousedown", handlePointer);
        window.removeEventListener("keydown", handleEscape);
      };
    }, [open]);

    const filteredOptions = React.useMemo(() => {
      const normalizedKeyword = keyword.trim().toLowerCase();
      if (!normalizedKeyword) {
        return options;
      }

      return options.filter((option) => {
        const haystack = [
          option.label,
          option.description ?? "",
          option.group ?? "",
          ...(option.keywords ?? []),
        ]
          .join(" ")
          .toLowerCase();

        return haystack.includes(normalizedKeyword);
      });
    }, [keyword, options]);

    const groupedOptions = React.useMemo(() => {
      const groups = new Map<string, SelectOption[]>();

      filteredOptions.forEach((option) => {
        const groupName = option.group ?? "";
        const existing = groups.get(groupName) ?? [];
        existing.push(option);
        groups.set(groupName, existing);
      });

      return Array.from(groups.entries());
    }, [filteredOptions]);

    return (
      <div ref={rootRef} className={cn("relative", className)}>
        <button
          ref={mergedRef}
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => {
            if (!disabled) {
              setOpen((current) => !current);
            }
          }}
          className="flex h-10 w-full items-center justify-between rounded-xl border border-white/[0.08] bg-[linear-gradient(180deg,rgba(24,24,27,0.96),rgba(12,12,15,0.98))] px-3 py-2 text-left text-sm text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500/40 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className={cn("truncate", !selected && "text-zinc-500")}>
            {selected?.label ?? placeholder}
          </span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-zinc-500 transition-transform", open && "rotate-180")} />
        </button>

        {open ? (
          <div
            role="listbox"
            className={cn(
              "absolute left-0 top-[calc(100%+8px)] z-50 max-h-80 w-full overflow-hidden rounded-2xl border border-white/[0.08] bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(8,10,15,0.98))] shadow-[0_20px_50px_rgba(0,0,0,0.45)] backdrop-blur-xl",
              menuClassName,
            )}
          >
            {searchable ? (
              <div className="border-b border-white/[0.06] p-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
                  <input
                    autoFocus
                    value={keyword}
                    onChange={(event) => setKeyword(event.target.value)}
                    placeholder={searchPlaceholder}
                    className="h-10 w-full rounded-xl border border-white/[0.08] bg-black/20 pl-9 pr-3 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-500 focus:border-sky-400/30"
                  />
                </div>
              </div>
            ) : null}

            <div className="max-h-72 overflow-y-auto p-1.5">
              {groupedOptions.length === 0 ? (
                <div className="px-3 py-4 text-sm text-zinc-500">{emptyText}</div>
              ) : (
                groupedOptions.map(([groupName, groupOptions]) => (
                  <div key={groupName || "default"} className="mb-1 last:mb-0">
                    {groupName ? (
                      <div className="px-3 pb-1.5 pt-2 text-[11px] font-medium uppercase tracking-[0.24em] text-zinc-500">
                        {groupName}
                      </div>
                    ) : null}
                    {groupOptions.map((option) => {
                      const active = option.value === value;
                      const toneClass =
                        option.tone === "danger"
                          ? active
                            ? "bg-red-500/12 text-red-100"
                            : "text-red-200 hover:bg-red-500/10"
                          : active
                            ? "bg-sky-500/12 text-zinc-50"
                            : "text-zinc-300 hover:bg-white/[0.05] hover:text-zinc-100";

                      return (
                        <button
                          key={option.value}
                          type="button"
                          role="option"
                          aria-selected={active}
                          onClick={() => {
                            onChange(option.value);
                            setOpen(false);
                          }}
                          className={cn("flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors", toneClass)}
                        >
                          <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-black/20">
                            {active ? (
                              <Check className={cn("h-3.5 w-3.5", option.tone === "danger" ? "text-red-300" : "text-sky-300")} />
                            ) : option.icon ? (
                              <span className="text-zinc-400">{option.icon}</span>
                            ) : null}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">{option.label}</div>
                            {option.description ? (
                              <div className="mt-0.5 text-xs text-zinc-500">{option.description}</div>
                            ) : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </div>
        ) : null}
      </div>
    );
  },
);

Select.displayName = "Select";
