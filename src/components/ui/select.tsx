import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/util/cn";

/**
 * A native <select> styled to match the rest of the kit.
 *
 * The CRM's filter bar lives inside a plain <form> that submits to the server,
 * so filters survive a page reload and are shareable as a URL. A native select
 * participates in form submission automatically; a JS-driven listbox would
 * need extra wiring for no user-visible gain here.
 */
export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  placeholder?: string;
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          "h-9 w-full appearance-none rounded-md border border-input bg-background px-3 pr-8 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  ),
);
Select.displayName = "Select";

export { Select };
