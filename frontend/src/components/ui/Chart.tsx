import ReactECharts, { EChartsReactProps } from 'echarts-for-react';
import type { CSSProperties } from 'react';
import { cn } from '@/src/lib/utils';

interface ChartProps extends Omit<EChartsReactProps, 'style'> {
  className?: string;
  style?: CSSProperties;
}

export function Chart({ className, ...props }: ChartProps) {
  return (
    <div className={cn("w-full h-full", className)}>
      <ReactECharts {...props} style={{ height: '100%', width: '100%', ...props.style }} />
    </div>
  );
}
