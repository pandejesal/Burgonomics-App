/**
 * Design token registry — mirrors CSS custom properties defined in
 * src/styles.css. Reference these keys from components/hooks instead
 * of hardcoding hex/rgb values (see R-FE-001).
 */

export const colors = {
  background: "var(--background)",
  foreground: "var(--foreground)",
  surface: "var(--surface)",
  surfaceElevated: "var(--surface-elevated)",
  bgSecondary: "var(--bg-secondary)",
  primary: "var(--primary)",
  primaryHover: "var(--primary-hover)",
  primaryForeground: "var(--primary-foreground)",
  primaryText: "var(--primary-text)",
  secondary: "var(--secondary)",
  secondaryForeground: "var(--secondary-foreground)",
  accent: "var(--accent)",
  accentHover: "var(--accent-hover)",
  accentForeground: "var(--accent-foreground)",
  brand: "var(--brand)",
  brandForeground: "var(--brand-foreground)",
  textPrimary: "var(--text-primary)",
  textSecondary: "var(--text-secondary)",
  textInverse: "var(--text-inverse)",
  textDisabled: "var(--text-disabled)",
  divider: "var(--divider)",
  border: "var(--border)",
  input: "var(--input)",
  ring: "var(--ring)",
  success: "var(--success)",
  successForeground: "var(--success-foreground)",
  warning: "var(--warning)",
  warningForeground: "var(--warning-foreground)",
  error: "var(--error)",
  errorForeground: "var(--error-foreground)",
  disabled: "var(--disabled)",
  veg: "var(--veg)",
  nonveg: "var(--nonveg)",
} satisfies Record<string, string>;

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
