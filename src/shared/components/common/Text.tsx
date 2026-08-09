import * as React from "react";
import { cn } from "@/lib/utils";

type Level =
  | "displayLarge"
  | "displayMedium"
  | "headlineLarge"
  | "headlineMedium"
  | "titleLarge"
  | "titleMedium"
  | "bodyLarge"
  | "bodyMedium"
  | "bodySmall"
  | "labelLarge"
  | "caption";

const map: Record<Level, string> = {
  displayLarge: "type-display-large",
  displayMedium: "type-display-medium",
  headlineLarge: "type-headline-large",
  headlineMedium: "type-headline-medium",
  titleLarge: "type-title-large",
  titleMedium: "type-title-medium",
  bodyLarge: "type-body-large",
  bodyMedium: "type-body",
  bodySmall: "type-body-sm",
  labelLarge: "type-label-large",
  caption: "type-caption",
};

const defaultTag: Record<Level, keyof React.JSX.IntrinsicElements> = {
  displayLarge: "h1",
  displayMedium: "h2",
  headlineLarge: "h2",
  headlineMedium: "h3",
  titleLarge: "h4",
  titleMedium: "h5",
  bodyLarge: "p",
  bodyMedium: "p",
  bodySmall: "p",
  labelLarge: "span",
  caption: "span",
};

interface TextProps extends React.HTMLAttributes<HTMLElement> {
  variant?: Level;
  as?: keyof React.JSX.IntrinsicElements;
  tone?: "primary" | "secondary" | "inverse" | "disabled" | "error" | "success";
}

export function Text({
  variant = "bodyMedium",
  as,
  tone = "primary",
  className,
  ...rest
}: TextProps) {
  const Tag = (as ?? defaultTag[variant]) as React.ElementType;
  const toneClass = {
    primary: "text-text-primary",
    secondary: "text-text-secondary",
    inverse: "text-text-inverse",
    disabled: "text-text-disabled",
    error: "text-error",
    success: "text-success",
  }[tone];
  return <Tag className={cn(map[variant], toneClass, className)} {...rest} />;
}
