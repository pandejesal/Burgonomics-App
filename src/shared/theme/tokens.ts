/**
 * Design token registry — mirrors CSS custom properties defined in
 * src/styles.css. Reference these keys from components/hooks instead
 * of hardcoding hex/rgb values (see R-FE-001).
 */
export const radius = {
  none: "0",
  small: "var(--radius-small)",
  medium: "var(--radius-medium)",
  large: "var(--radius-large)",
  xlarge: "var(--radius-xlarge)",
  pill: "var(--radius-pill)",
} satisfies Record<string, string>;

export const space = {
  xxxs: "var(--spacing-xxxs)",
  xxs: "var(--spacing-xxs)",
  xs: "var(--spacing-xs)",
  sm: "var(--spacing-sm)",
  md: "var(--spacing-md)",
  lg: "var(--spacing-lg)",
  xl: "var(--spacing-xl)",
  xxl: "var(--spacing-xxl)",
} satisfies Record<string, string>;

export const elevation = {
  flat: "var(--shadow-flat)",
  low: "var(--shadow-low)",
  medium: "var(--shadow-medium)",
  high: "var(--shadow-high)",
} satisfies Record<string, string>;

export const motion = {
  drillDown: { duration: 200, easing: "var(--ease-out-quad)" },
  modal: { duration: 250, easing: "var(--ease-out-quint)" },
  tab: { duration: 100, easing: "linear" },
  alert: { duration: 300, easing: "var(--ease-out-back)" },
} satisfies Record<string, { duration: number; easing: string }>;
