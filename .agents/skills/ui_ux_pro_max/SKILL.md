Title: Live Content

Description: Fetched live

Source: https://raw.githubusercontent.com/krishnakanthb13/antigravity_global_skills/main/ui_ux_pro_max/SKILL.md

---

---
name: ui_ux_pro_max
description: UI/UX design intelligence with searchable database of patterns, styles, and stacks.
---

# UI/UX Pro Max

A comprehensive design intelligence skill for web and mobile applications. Contains 67 styles, 96 color palettes, 57 font pairings, 99 UX guidelines, and 25 chart types across 13 technology stacks. Searchable database with priority-based recommendations.

## Prerequisites

Check if Python is installed:

```powershell
python --version
```

If Python is not installed, install it:
```powershell
winget install Python.Python.3.12
```

---

## How to Use This Skill

When user requests UI/UX work (design, build, create, implement, review, fix, improve), follow this workflow:

### Step 1: Analyze User Requirements

Extract key information from user request:
- **Product type**: SaaS, e-commerce, portfolio, dashboard, landing page, etc.
- **Style keywords**: minimal, playful, professional, elegant, dark mode, etc.
- **Industry**: healthcare, fintech, gaming, education, etc.
- **Stack**: React, Vue, Next.js, or default to `html-tailwind`

### Step 2: Generate Design System (REQUIRED)

**Always start with `--design-system`** to get comprehensive recommendations with reasoning:

```powershell
python "C:\Users\ADMIN\.gemini\antigravity\skills\ui_ux_pro_max\scripts\search.py" "<product_type> <industry> <keywords>" --design-system
```

You can optionally add `-p "Project Name"` if known.

This command:
1. Searches 5 domains in parallel (product, style, color, landing, typography)
2. Applies reasoning rules to select best matches
3. Returns complete design system: pattern, style, colors, typography, effects
4. Includes anti-patterns to avoid

**Example:**
```powershell
python "C:\Users\ADMIN\.gemini\antigravity\skills\ui_ux_pro_max\scripts\search.py" "beauty spa wellness service" --design-system -p "Serenity Spa"
```

### Step 2b: Persist Design System (Master + Overrides Pattern)

To save the design system for hierarchical retrieval across sessions, add `--persist`.
Note: This requires write permissions to the current working directory.

```powershell
python "C:\Users\ADMIN\.gemini\antigravity\skills\ui_ux_pro_max\scripts\search.py" "<query>" --design-system --persist -p "Project Name"
```

### Step 3: Supplement with Detailed Searches (as needed)

After getting the design system, use domain searches to get additional details:

```powershell
python "C:\Users\ADMIN\.gemini\an

