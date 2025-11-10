import * as React from "react";

import { cn } from "@/lib/utils";

type ProgressProps = React.ComponentPropsWithRef<"div"> & {
  value?: number;
  max?: number;
  indicatorClassName?: string;
};

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value = 0, max = 100, indicatorClassName, ...props }, ref) => {
    const clampedValue = Math.min(Math.max(value, 0), max);
    const percentage = max === 0 ? 0 : (clampedValue / max) * 100;

    return (
      <div
        ref={ref}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.round(clampedValue)}
        className={cn(
          "relative h-2 w-full overflow-hidden rounded-full bg-secondary",
          className
        )}
        {...props}
      >
        <div
          className={cn(
            "absolute inset-y-0 left-0 rounded-full bg-primary transition-all",
            indicatorClassName
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
    );
  }
);

Progress.displayName = "Progress";

export { Progress };
