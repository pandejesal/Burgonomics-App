import { createFileRoute, Link } from "@tanstack/react-router";
import { Leaf, ExternalLink } from "lucide-react";
import { AppShell } from "@/shared/layouts/AppShell";
import { AppCard } from "@/shared/components/common/AppCard";
import { AppBadge } from "@/shared/components/common/AppBadge";
import { Text } from "@/shared/components/common/Text";
import { APP } from "@/core/constants/app";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About — Burgonomics (100% Pure Vegetarian)" },
      {
        name: "description",
        content: "Learn about Burgonomics — a 100% pure vegetarian kitchen.",
      },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <AppShell title="About" backTo="/profile" showTabs showTopBar>
      <div className="mx-auto max-w-[520px] space-y-4 px-4 py-6">
        <div className="text-center">
          <div className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-full bg-success/10 text-success">
            <Leaf className="h-7 w-7" aria-hidden />
          </div>
          <Text as="h1" variant="headlineLarge">
            {APP.name}
          </Text>
          <AppBadge tone="success" className="mt-1">
            {APP.vegPromise}
          </AppBadge>
        </div>

        <AppCard padded>
          <Text variant="titleMedium">Our story</Text>
          <Text variant="bodyMedium" tone="secondary" className="mt-2">
            Burgonomics is a 100% Pure Vegetarian kitchen. Every item on our menu — across every
            store — is prepared in a strictly vegetarian kitchen, with no cross-contact with
            non-vegetarian ingredients.
          </Text>
          <Text variant="bodyMedium" tone="secondary" className="mt-2">
            Our menu, offers, and combos are curated by our culinary team and served live from each
            store. What you see in the app is exactly what's available at your selected store, right
            now.
          </Text>
        </AppCard>

        <AppCard padded>
          <Text variant="titleMedium">Restaurant information</Text>
          <div className="mt-2 space-y-1">
            <Text variant="bodyMedium">Burgonomics Foods Pvt. Ltd.</Text>
            <Text variant="bodyMedium" tone="secondary">
              FSSAI-licensed &amp; regularly audited kitchens
            </Text>
            <Text variant="bodyMedium" tone="secondary">
              Support: {APP.supportEmail}
            </Text>
          </div>
        </AppCard>

        <AppCard padded>
          <Text variant="titleMedium">Follow us</Text>
          <div className="mt-2 flex flex-wrap gap-2">
            {["Instagram", "X", "YouTube", "LinkedIn"].map((s) => (
              <span
                key={s}
                className="inline-flex items-center gap-1 rounded-full border border-divider bg-bg-secondary px-3 py-1 type-caption text-text-secondary"
              >
                {s}
                <ExternalLink className="h-3 w-3" aria-hidden />
              </span>
            ))}
          </div>
          <Text variant="caption" tone="secondary" className="mt-2">
            Social channels launching alongside our next store.
          </Text>
        </AppCard>

        <AppCard padded>
          <Text variant="titleMedium">Legal</Text>
          <ul className="mt-2 space-y-1">
            <li>
              <Link to="/terms" className="type-label-large text-primary hover:underline">
                Terms &amp; conditions
              </Link>
            </li>
            <li>
              <Link to="/privacy" className="type-label-large text-primary hover:underline">
                Privacy policy
              </Link>
            </li>
            <li>
              <Text variant="caption" tone="secondary">
                Open-source licences: React, TanStack Router, Zustand, TailwindCSS, lucide-react.
              </Text>
            </li>
          </ul>
        </AppCard>

        <Text variant="caption" tone="secondary" className="text-center">
          {APP.name} v1.0.0 · Made with ♥ in India
        </Text>
      </div>
    </AppShell>
  );
}
