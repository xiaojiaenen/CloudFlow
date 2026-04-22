import type { EChartsReactProps } from "echarts-for-react";
import { BarChart, LineChart, PieChart } from "echarts/charts";
import { GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { use } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { type ComponentType, type CSSProperties, useEffect, useRef, useState } from "react";
import { cn } from "@/src/lib/utils";

interface ChartProps extends Omit<EChartsReactProps, "style"> {
  className?: string;
  style?: CSSProperties;
  lazy?: boolean;
  minHeight?: number;
}

type EChartsCoreProps = EChartsReactProps & {
  echarts: typeof echarts;
};

type EChartsComponent = ComponentType<EChartsCoreProps>;

type IdleWindow = Window & {
  requestIdleCallback?: (
    callback: () => void,
    options?: {
      timeout?: number;
    },
  ) => number;
  cancelIdleCallback?: (id: number) => void;
};

use([BarChart, LineChart, PieChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

export function Chart({
  className,
  lazy = true,
  minHeight = 280,
  ...props
}: ChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [shouldLoad, setShouldLoad] = useState(!lazy);
  const [ChartComponent, setChartComponent] = useState<EChartsComponent | null>(null);

  useEffect(() => {
    if (!lazy || shouldLoad || typeof window === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      {
        rootMargin: "160px",
      },
    );

    const element = containerRef.current;
    if (element) {
      observer.observe(element);
    }

    return () => observer.disconnect();
  }, [lazy, shouldLoad]);

  useEffect(() => {
    if (!shouldLoad || ChartComponent) {
      return;
    }

    let cancelled = false;
    const idleWindow = window as IdleWindow;
    let idleId: number | null = null;
    let timeoutId: number | null = null;

    const load = () => {
      void import("echarts-for-react/lib/core").then((module) => {
        if (!cancelled) {
          setChartComponent(() => module.default as EChartsComponent);
        }
      });
    };

    if (typeof idleWindow.requestIdleCallback === "function") {
      idleId = idleWindow.requestIdleCallback(load, { timeout: 1200 });
    } else {
      timeoutId = window.setTimeout(load, 0);
    }

    return () => {
      cancelled = true;
      if (idleId !== null && typeof idleWindow.cancelIdleCallback === "function") {
        idleWindow.cancelIdleCallback(idleId);
      }
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [ChartComponent, shouldLoad]);

  return (
    <div
      ref={containerRef}
      className={cn("w-full h-full", className)}
      style={{ minHeight, ...props.style }}
    >
      {ChartComponent ? (
        <ChartComponent
          {...props}
          echarts={echarts}
          style={{ height: "100%", width: "100%", ...props.style }}
        />
      ) : (
        <div
          className="flex h-full items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.03] text-sm text-zinc-500"
          style={{ minHeight }}
        >
          图表加载中...
        </div>
      )}
    </div>
  );
}
