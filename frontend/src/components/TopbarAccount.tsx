import { LogOut, ShieldCheck, UserRound } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/src/context/AuthContext";
import { cn } from "@/src/lib/utils";
import { InitialAvatar } from "./InitialAvatar";

interface TopbarAccountProps {
  className?: string;
}

function getRoleLabel(role: "admin" | "user" | undefined, isSuperAdmin?: boolean) {
  if (isSuperAdmin) {
    return "超级管理员";
  }

  return role === "admin" ? "管理员" : "普通用户";
}

export function TopbarAccount({ className }: TopbarAccountProps) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  return (
    <div
      className={cn(
        "ml-auto flex min-w-0 shrink-0 items-center gap-2.5 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-2.5 py-2 backdrop-blur-md",
        className,
      )}
    >
      <InitialAvatar name={user?.name} className="h-8 w-8 rounded-xl text-xs" />
      <div className="min-w-0 text-right">
        <div className="truncate text-xs font-medium text-zinc-100">{user?.name ?? "未登录"}</div>
        <div className="mt-0.5 flex items-center justify-end gap-1 text-[11px] text-zinc-500">
          {user?.role === "admin" || user?.isSuperAdmin ? (
            <ShieldCheck className="h-3.5 w-3.5 text-sky-400" />
          ) : (
            <UserRound className="h-3.5 w-3.5 text-zinc-400" />
          )}
          <span className="truncate">{getRoleLabel(user?.role, user?.isSuperAdmin)}</span>
        </div>
      </div>
      <button
        type="button"
        onClick={() => {
          logout();
          navigate("/login", { replace: true });
        }}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-zinc-900/80 text-zinc-400 transition-colors hover:border-white/20 hover:text-white"
        title="退出登录"
        aria-label="退出登录"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
}
