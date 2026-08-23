# BURGONOMICS — Coding Standards (Layer 3 Constraint)

> **Factory Configuration**: Engineering standards, TypeScript patterns, WCAG 2.2 AA accessibility, performance, and security constraints.

---

## 1. 🛡️ TypeScript & Component Architecture
- **Strict Typing**: Zero `any` types. All props and models must be typed and exported.
- **Component File Structure**: One component per file (`ComponentName.tsx`).
- **State Management**:
  - **Server State**: Always use `TanStack Query` (`useQuery`, `useMutation`). Never use `useEffect` for data fetching.
  - **Client UI State**: Lightweight `Zustand` stores.
- **Data Boundary Validation**: Validate all external inputs, POS payloads, and API requests with `Zod` schemas before processing.

---

## 2. ♿ Accessibility (WCAG 2.2 AA Mandatory)
1. **Semantic HTML**: Use proper tags (`<main>`, `<header>`, `<nav>`, `<section>`, `<button>`). No click handlers on `<div>` elements.
2. **Heading Order**: Strictly sequential (`<h1>` -> `<h2>` -> `<h3>`). Exactly one `<h1>` per view.
3. **Touch Targets**: Minimum `44px x 44px` on all interactive buttons, inputs, and tab triggers.
4. **Keyboard Navigation & Focus**: All interactive items reachable via Tab with visible focus ring (`outline: 2px solid var(--color-ring)`).
5. **Labels & ARIA**:
   - Every input has an associated `<label htmlFor="...">`.
   - Icon-only buttons must include `aria-label`.
   - Dynamic live updates (cart badge, order status) must use `aria-live="polite"`.
6. **Motion**: Respect `prefers-reduced-motion: reduce`.

---

## 3. 🔒 Security & Data Integrity
- **No Direct Dangerous Writes**: Sensitive mutations (payments, order pushing, role escalation) must execute through authenticated Netlify serverless functions.
- **Zero Console Logs**: Strip all `console.log` / debug statements before commit.
- **Environment Variables**: Never hardcode API keys, Firebase secrets, or Petpooja credentials.
- **Capacitor Debugging**: `CAPACITOR_DEBUG=false` in all release builds.

---

## 4. 🚦 Mandatory Verification Gate
Every task/stage must pass:
```bash
npx tsc --noEmit && npx vitest run && vite build
```
