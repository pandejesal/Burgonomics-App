# BURGONOMICS — Design System (Layer 3 Constraint)

> **Factory Configuration**: Single source of truth for all visual tokens, 60-30-10 palette rules, typography, spacing, and dark mode invariants.
> **Locked Grill Directives (Q1)**: La Pino'z premium simple palette (#F5F5F5 / #0E4825 30% / #FF6600 10% light; #0A0A0A / #0E4825 / #CC5200 dark; #4ADE80 WCAG AAA text on dark).

---

## 1. 🎨 Color Palette (Strict 60-30-10)

### Light Mode (`:root`)
| Role | Token | Value | Description |
|---|---|---|---|
| **60% Canvas** | `--background` | `#F5F5F5` | Clean, airy background |
| | `--surface` | `#FFFFFF` | Cards, modals, inputs, containers |
| | `--surface-elevated`| `#FFFFFF` | Dropdowns, popovers, tooltips |
| | `--bg-secondary` | `#F5F5F5` | Secondary surface background |
| **30% Brand** | `--primary` | `#0E4825` | Forest Green: Primary buttons, active tabs, brand headers |
| | `--primary-foreground` | `#FFFFFF` | Crisp white text on primary |
| | `--primary-text` | `#0E4825` | Forest green text on light surface |
| **10% Accent** | `--accent` | `#FF6600` | Vibrant Orange: CTAs, deal badges, highlights |
| | `--accent-foreground` | `#FFFFFF` | White text on accent |

### Dark Mode (`.dark`)
| Role | Token | Value | Description |
|---|---|---|---|
| **60% Canvas** | `--background` | `#0A0A0A` | Deep Charcoal/Black canvas |
| | `--surface` | `#1A1A1A` | Dark Card surfaces |
| | `--surface-elevated`| `#1E1E1E` | Elevated modals/popovers |
| | `--bg-secondary` | `#141414` | Secondary dark surface |
| **30% Brand** | `--primary` | `#0E4825` | Consistent Forest Green anchor |
| | `--primary-foreground` | `#FFFFFF` | Text on primary |
| | `--primary-text` | `#4ADE80` | High-contrast WCAG AAA Emerald text on dark surface |
| **10% Accent** | `--accent` | `#CC5200` | Deep Amber/Dark Orange for dark mode readability |
| | `--accent-foreground` | `#FFFFFF` | Text on accent |

---

## 2. 📝 Typography Tokens

| Class Name | Font Family | Size | Weight | Line Height | Usage |
|---|---|---|---|---|---|
| `.type-hero` | MonstroSolid / Outfit | 36px | 800 | 1.2 | Hero title text |
| `.type-display` | MonstroSolid / Outfit | 28px | 800 | 1.25 | Main page headers |
| `.type-display-medium` | MonstroSolid / Outfit | 22px | 700 | 1.3 | Modal headers, banner titles |
| `.type-headline-large` | MonstroSolid / Outfit | 24px | 700 | 1.3 | Major section headlines |
| `.type-headline-medium`| MonstroSolid / Outfit | 20px | 700 | 1.35 | Card group titles |
| `.type-title-large` | Montserrat / Inter | 18px | 700 | 1.4 | Product & card titles |
| `.type-title` | Montserrat / Inter | 17px | 700 | 1.4 | Item titles |
| `.type-body-large` | Montserrat / Inter | 17px | 600 | 1.45 | Lead copy |
| `.type-body` | Montserrat / Inter | 15px | 500 | 1.45 | Standard body text |
| `.type-body-sm` | Montserrat / Inter | 14px | 400 | 1.45 | Secondary copy, sub-text |
| `.type-label-large` | Montserrat / Inter | 14px | 600 | 1.4 | Button labels |
| `.type-label-medium` | Montserrat / Inter | 13px | 500 | 1.4 | Form field labels |
| `.type-caption` | Montserrat / Inter | 12px | 400 | 1.45 | Footnotes, timestamps |
| `.type-button` | Montserrat / Inter | 15px | 600 | 1.4 | Primary action buttons |

---

## 3. 📐 Spacing & Radius Scale
- **Spacing**: `--spacing-xxxs: 8px`, `--spacing-xxs: 12px`, `--spacing-xs: 16px`, `--spacing-sm: 20px`, `--spacing-md: 24px`, `--spacing-lg: 32px`, `--spacing-xl: 40px`, `--spacing-xxl: 56px`.
- **Radius**: `--radius-small: 6px`, `--radius-medium: 12px`, `--radius-large: 20px`, `--radius-pill: 9999px`.

---

## 4. 🚫 Forbidden Patterns & Invariants
1. **Zero Raw Hex / Raw Tailwind Color Classes**: Always use semantic tokens (`bg-primary`, `bg-surface`, `text-accent`).
2. **Touch Targets**: Minimum `44px x 44px` on all interactive buttons and store selector cards.
3. **Contrast Compliance**: Normal text must satisfy WCAG 2.2 AA (≥ 4.5:1 ratio).
