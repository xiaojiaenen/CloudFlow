import { useEffect, useState } from "react";
import { Activity, CalendarClock, Home, Plus, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function GlobalContextMenu() {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const navigate = useNavigate();

  useEffect(() => {
    const handleContextMenu = (event: MouseEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      if ((event as MouseEvent & { customContextMenuHandled?: boolean }).customContextMenuHandled) {
        return;
      }

      event.preventDefault();

      const menuWidth = 208;
      const menuHeight = 220;
      let x = event.clientX;
      let y = event.clientY;

      if (x + menuWidth > window.innerWidth) {
        x = window.innerWidth - menuWidth - 10;
      }
      if (y + menuHeight > window.innerHeight) {
        y = window.innerHeight - menuHeight - 10;
      }

      setPosition({ x, y });
      setVisible(true);
    };

    const handleDismiss = () => {
      if (visible) {
        setVisible(false);
      }
    };

    window.addEventListener("contextmenu", handleContextMenu);
    window.addEventListener("click", handleDismiss);
    window.addEventListener("scroll", handleDismiss, true);

    return () => {
      window.removeEventListener("contextmenu", handleContextMenu);
      window.removeEventListener("click", handleDismiss);
      window.removeEventListener("scroll", handleDismiss, true);
    };
  }, [visible]);

  if (!visible) {
    return null;
  }

  const menuItems = [
    { icon: Home, label: "返回工作区", action: () => navigate("/") },
    { icon: Plus, label: "新建工作流", action: () => navigate("/") },
    { icon: Activity, label: "监控中心", action: () => navigate("/monitor") },
    { divider: true },
    { icon: RefreshCw, label: "刷新页面", action: () => window.location.reload() },
    { icon: CalendarClock, label: "调度管理中心", action: () => navigate("/settings") },
  ];

  return (
    <div
      className="fixed z-[9999] w-52 overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-950/92 py-1.5 shadow-[0_16px_48px_rgba(0,0,0,0.55)] backdrop-blur-xl"
      style={{ left: position.x, top: position.y }}
    >
      {menuItems.map((item, index) => {
        if ("divider" in item) {
          return <div key={`divider-${index}`} className="mx-2 my-1.5 h-px bg-white/[0.08]" />;
        }

        const Icon = item.icon;
        return (
          <button
            key={item.label}
            type="button"
            onClick={item.action}
            className="flex w-full items-center gap-3 px-3 py-2 text-sm text-zinc-300 transition-colors hover:bg-sky-500/15 hover:text-zinc-100"
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
