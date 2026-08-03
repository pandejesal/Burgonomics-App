import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ProtectedRoute } from "@/features/auth/components/ProtectedRoute";
import { AppShell } from "@/shared/layouts/AppShell";
import { EditProfileForm } from "@/features/profile/components/EditProfileForm";
import { useProfileStore } from "@/features/profile/state/profileStore";
import { useAuthStore } from "@/features/auth/state/authStore";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { toast } from "sonner";

export const Route = createFileRoute("/profile/edit")({
  head: () => ({
    meta: [
      { title: "Edit profile — Burgonomics" },
      { name: "description", content: "Update your name, email and preferences." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <ProtectedRoute>
      <Body />
    </ProtectedRoute>
  );
}

function Body() {
  const profile = useProfileStore((s) => s.profile);
  const authUser = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  const activeProfile =
    profile ??
    (authUser
      ? {
          id: authUser.id,
          phone: authUser.phone,
          fullName: authUser.name || "Burger Lover",
          email: `${authUser.phone}@burgonomics.in`,
          membershipTier: "silver" as const,
          createdAt: new Date().toISOString(),
        }
      : null);

  return (
    <AppShell title="Edit profile" backTo="/profile" showTabs showTopBar>
      <div className="mx-auto max-w-[520px] px-4 py-4">
        {activeProfile ? (
          <EditProfileForm
            profile={activeProfile}
            onCancel={() => void navigate({ to: "/profile" })}
            onSaved={() => {
              toast.success("Profile updated");
              void navigate({ to: "/profile" });
            }}
          />
        ) : (
          <EmptyState
            title="Profile unavailable"
            description="We couldn't load your profile. Please try again."
          />
        )}
      </div>
    </AppShell>
  );
}
