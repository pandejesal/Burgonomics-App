import type { MenuCategory } from "@/features/menu/services/menuService";

type ShortcutKey = "burgers" | "wraps" | "sides" | "drinks";

interface ShortcutDefinition {
  readonly key: ShortcutKey;
  readonly label: string;
  readonly categoryKeys: readonly string[];
  readonly imageUrl: string | null;
  readonly alternateImageUrl: string | null;
}

export interface HomeMenuShortcut {
  readonly key: ShortcutKey;
  readonly label: string;
  readonly members: readonly MenuCategory[];
  readonly imageUrl: string | null;
  readonly alternateImageUrl: string | null;
}

// Presentation groups only: these keys are never POS IDs or menu filters.
const SHORTCUTS: readonly ShortcutDefinition[] = [
  {
    key: "burgers",
    label: "Burgers",
    categoryKeys: [
      "big-bang-burgers",
      "classic-burgers",
      "sizzling",
      "sydney-s-viral",
      "ufo-burgers",
    ],
    imageUrl: "/images/menu/classic-burgers/hero-burger.jpg",
    alternateImageUrl: "/images/menu/classic-burgers/mexican-mafia-burger.jpg",
  },
  {
    key: "wraps",
    label: "Wraps",
    categoryKeys: ["wraps"],
    imageUrl: null,
    alternateImageUrl: null,
  },
  {
    key: "sides",
    label: "Sides",
    categoryKeys: ["sides"],
    imageUrl: "/images/menu/fries/salted-fries.jpg",
    alternateImageUrl: "/images/menu/fries/peri-peri-fries.jpg",
  },
  {
    key: "drinks",
    label: "Shakes & Drinks",
    categoryKeys: ["shakes", "coolers", "cold-coffee"],
    imageUrl: "/images/menu/thick-shakes/oreo-shake.jpg",
    alternateImageUrl: "/images/menu/thick-shakes/chocolate-shake.jpg",
  },
];

function normalizeCategoryKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Only intersect categories derived from the selected store's loaded products. */
export function resolveHomeMenuShortcuts(
  categories: readonly MenuCategory[],
): readonly HomeMenuShortcut[] {
  if (categories.length === 0) return [];

  return SHORTCUTS.map((shortcut) => {
    const members = categories.filter((category) => {
      if (typeof category.id !== "string" || !category.id.trim()) return false;
      const nameMatches = shortcut.categoryKeys.includes(normalizeCategoryKey(category.name));
      // No Wraps POS ID has been verified; only a loaded category named Wraps qualifies.
      const idMatches =
        shortcut.key !== "wraps" &&
        shortcut.categoryKeys.includes(normalizeCategoryKey(category.id));
      return nameMatches || idMatches;
    });
    return {
      key: shortcut.key,
      label: shortcut.label,
      members,
      imageUrl: members.length > 0 ? shortcut.imageUrl : null,
      alternateImageUrl: members.length > 0 ? shortcut.alternateImageUrl : null,
    };
  });
}
