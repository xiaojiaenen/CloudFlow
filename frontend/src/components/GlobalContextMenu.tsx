import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, Plus, Settings, Home, Activity } from 'lucide-react';

export function GlobalContextMenu() {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const navigate = useNavigate();

  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      // Don't override context menu if clicking on input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Check if the event was already handled by a custom context menu (e.g., canvas or node)
      if ((e as any).customContextMenuHandled) {
        return;
      }
      
      e.preventDefault();
      
      // Keep menu within viewport bounds
      const menuWidth = 192; // w-48 = 12rem = 192px
      const menuHeight = 220; // approximate height
      
      let x = e.clientX;
      let y = e.clientY;
      
      if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 10;
      if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 10;
      
      setPosition({ x, y });
      setVisible(true);
    };

    const handleClick = () => {
      if (visible) setVisible(false);
    };

    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('click', handleClick);
    window.addEventListener('scroll', handleClick, true);

    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('click', handleClick);
      window.removeEventListener('scroll', handleClick, true);
    };
  }, [visible]);

  if (!visible) return null;

  const menuItems = [
    { icon: Home, label: '返回首页', action: () => navigate('/') },
    { icon: Plus, label: '新建工作流', action: () => navigate('/') },
    { icon: Activity, label: '监控中心', action: () => navigate('/monitor') },
    { divider: true },
    { icon: RefreshCw, label: '刷新页面', action: () => window.location.reload() },
    { icon: Settings, label: '系统设置', action: () => navigate('/settings') },
  ];

  return (
    <div 
      className="fixed z-[9999] w-48 bg-zinc-950/90 backdrop-blur-xl border border-white/[0.08] rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] overflow-hidden py-1.5 animate-in fade-in zoom-in-95 duration-100"
      style={{ left: position.x, top: position.y }}
    >
      {menuItems.map((item, idx) => {
        if (item.divider) {
          return <div key={idx} className="h-px bg-white/[0.08] my-1.5 mx-2" />;
        }
        
        const Icon = item.icon!;
        return (
          <button
            key={idx}
            onClick={item.action}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-300 hover:text-zinc-100 hover:bg-sky-500/20 transition-colors"
          >
            <Icon className="w-4 h-4" />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
