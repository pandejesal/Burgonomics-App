import * as React from "react";
import { Text } from "@/shared/components/common/Text";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  value: string;
  presets: string[];
  placeholder?: string;
  maxLength?: number;
  onChange: (v: string) => void;
  helperText?: string;
}

/**
 * NotesEditor — a shared quick-pick + free-text editor used for order
 * notes, delivery instructions, pickup instructions, and dining notes.
 * Presets come from the repository so the backend can tune them
 * without a mobile release.
 */
export function NotesEditor({
  label,
  value,
  presets,
  placeholder,
  maxLength = 200,
  onChange,
  helperText,
}: Props) {
  const inputId = React.useId();
  const toggle = (preset: string) => {
    const parts = value
      .split(/\.\s*/)
      .map((p) => p.trim())
      .filter(Boolean);
    const has = parts.includes(preset);
    const next = has ? parts.filter((p) => p !== preset) : [...parts, preset];
    onChange(next.join(". "));
  };
  return (
    <div className="space-y-2">
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      {presets.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => {
            const active = value.toLowerCase().includes(p.toLowerCase());
            return (
              <button
                key={p}
                type="button"
                onClick={() => toggle(p)}
                aria-pressed={active}
                className={cn(
                  "rounded-full border px-3 py-1 type-caption transition-colors",
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-divider text-text-secondary hover:border-primary/40",
                )}
              >
                {p}
              </button>
            );
          })}
        </div>
      )}
      <textarea
        id={inputId}
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, maxLength))}
        placeholder={placeholder}
        rows={3}
        className="w-full rounded-[var(--radius-medium)] border border-divider bg-surface px-3 py-2 type-body-medium outline-none focus:border-primary"
      />
      <div className="flex items-center justify-between">
        <Text variant="caption" tone="secondary">
          {helperText ?? "This note is shared with the kitchen."}
        </Text>
        <Text variant="caption" tone="secondary">
          {value.length}/{maxLength}
        </Text>
      </div>
    </div>
  );
}
