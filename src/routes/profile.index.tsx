import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Pencil,
  MapPin,
  ShoppingBag,
  Heart,
  Bell,
  LifeBuoy,
  Info,
  Lock,
  FileText,
  LogOut,
  Settings as SettingsIcon,
} from "lucide-react";
import { AppShell } from "@/shared/layouts/AppShell";
import { useAuthStore, selectIsAuthenticated } from "@/features/auth/state/authStore";
import { useProfileStore, computeCompletion } from "@/features/profile/state/profileStore";
import { profileRepository } from "@/features/profile/repositories/ProfileRepository";
import { favoritesRepository } from "@/features/favorites/repositories/FavoritesRepository";
import { useNotificationsStore } from "@/features/notifications/state/notificationsStore";
import { ProfileHeader } from "@/features/profile/components/ProfileHeader";
import {
  ProfileMenuList,
  type ProfileMenuItem,
} from "@/features/profile/components/ProfileMenuList";
import { GuestProfilePrompt } from "@/features/profile/components/GuestProfilePrompt";
import { ConfirmDialog } from "@/shared/components/common/ConfirmDialog";
import { useHydrated } from "@/shared/hooks/useHydrated";
import { AppBadge } from "@/shared/components/common/AppBadge";

export const Route = createFileRoute("/profile/")({
  head: () => ({
    meta: [
      { title: "Profile — Burgonomics" },
      { name: "description", content: "Manage your account, addresses, favourites and orders." },
    ],
  }),
  component: Page,
});

function Page() {
  const hydrated = useHydrated();
  const isAuth = useAuthStore(selectIsAuthenticated);
  const authUser = useAuthStore((s) => s.user);
  const profile = useProfileStore((s) => s.profile);
  const navigate = useNavigate();
  const [confirmLogout, setConfirmLogout] = React.useState(false);
  const unreadCount = useNotificationsStore((s) => s.unreadCount);

  // Keep profile store in sync with the auth session (idempotent).
  React.useEffect(() => {
    if (isAuth && authUser) profileRepository.hydrateFromAuth(authUser);
  }, [isAuth, authUser]);

  const handleLogout = async () => {
    await useAuthStore.getState().logout();
    // Clear profile store cache
    useProfileStore.getState().clear();
    profileRepository.clearCache();
    favoritesRepository.clear();
    // Cart, store selection, fulfillment method and addresses are
    // intentionally preserved — see PRD "LOGOUT" section.
    void navigate({ to: "/home", replace: true });
  };

  const activeProfile =
    profile ??
    (isAuth && authUser
      ? {
          id: authUser.id,
          phone: authUser.phone,
          fullName: authUser.name ?? "Burger Lover",
          email: `${authUser.phone}@burgonomics.in`,
          membershipTier: "silver",
          createdAt: new Date().toISOString(),
        }
      : null);

  // Guest — pre-hydration we still render the guest view (safe default).
  if (!hydrated || !isAuth || !activeProfile) {
    return (
      <AppShell title="Profile" showTabs showTopBar>
        <GuestProfilePrompt />
      </AppShell>
    );
  }

  const completion = computeCompletion(activeProfile);

  const accountItems: ProfileMenuItem[] = [
    {
      id: "edit",
      label: "Edit profile",
      description: "Name, email, date of birth",
      to: "/profile/edit",
      Icon: Pencil,
    },
    {
      id: "addresses",
      label: "Saved addresses",
      description: "Home, Work and more",
      to: "/profile/addresses",
      Icon: MapPin,
    },
    {
      id: "orders",
      label: "Order history",
      description: "Track and reorder your past orders",
      to: "/orders",
      Icon: ShoppingBag,
    },
    {
      id: "favorites",
      label: "Favourites",
      description: "Your loved products and combos",
      to: "/profile/favorites",
      Icon: Heart,
    },
    {
      id: "notifications",
      label: "Notifications",
      description: "Offers and order updates",
      to: "/profile/notifications",
      Icon: Bell,
      trailing: unreadCount > 0 ? <AppBadge tone="primary">{unreadCount}</AppBadge> : undefined,
    },
  ];

  const helpItems: ProfileMenuItem[] = [
    { id: "support", label: "Help & support", to: "/support", Icon: LifeBuoy },
    { id: "settings", label: "Settings", to: "/profile/settings", Icon: SettingsIcon },
    { id: "about", label: "About Burgonomics", to: "/about", Icon: Info },
    { id: "privacy", label: "Privacy policy", to: "/privacy", Icon: Lock },
    { id: "terms", label: "Terms & conditions", to: "/terms", Icon: FileText },
  ];

  const dangerItems: ProfileMenuItem[] = [
    {
      id: "logout",
      label: "Log out",
      Icon: LogOut,
      danger: true,
      onClick: () => setConfirmLogout(true),
    },
  ];

  return (
    <AppShell title="Profile" showTabs showTopBar>
      <div className="mx-auto max-w-[520px] space-y-4 px-4 py-4">
        <ProfileHeader profile={activeProfile} completion={completion} />
        <ProfileMenuList title="Account" items={accountItems} />
        <ProfileMenuList title="More" items={helpItems} />
        <ProfileMenuList items={dangerItems} />
        <p className="pt-2 text-center type-caption text-text-secondary">
          Burgonomics — 100% Pure Vegetarian
        </p>
      </div>

      <ConfirmDialog
        open={confirmLogout}
        onOpenChange={setConfirmLogout}
        title="Log out of your account?"
        description="Your saved cart, address and store selection will be preserved for your next visit."
        confirmLabel="Log out"
        destructive
        onConfirm={() => void handleLogout()}
      />
    </AppShell>
  );
}
