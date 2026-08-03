import * as React from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchBarProps extends React.InputHTMLAttributes<HTMLInputElement> {
  onClear?: () => void;
}

export const SearchBar = React.forwardRef<HTMLInputElement, SearchBarProps>(
  ({ className, ...rest }, ref) => (
    <label
      className={cn(
        "flex h-12 items-center gap-2 rounded-full border border-divider bg-surface px-4",
        "focus-within:border-primary transition-colors",
        className,
      )}
    >
      <Search className="h-5 w-5 text-text-secondary" aria-hidden />
      <input
        ref={ref}
        type="search"
        className="flex-1 bg-transparent outline-none text-sm placeholder:text-text-disabled"
        {...rest}
      />
    </label>
  ),
);
SearchBar.displayName = "SearchBar";
