import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-11 w-full min-w-0 rounded-md border border-gray-300 bg-white/80 px-4 py-2 text-base text-foreground shadow-sm transition focus-visible:outline-none placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:border-gray-700 dark:bg-slate-900/60",
        "focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/20",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  );
}

export { Input };
