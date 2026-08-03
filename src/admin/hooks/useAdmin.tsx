import { useAdminAuthStore } from "../store/adminAuthStore";

export function useAdmin() {
  const { admin, accessToken, isLoading } = useAdminAuthStore();

  const permissions = admin?.role?.permissions || [];
  const roleName = admin?.role?.name || "";
  const isDeveloper = admin?.role?.name === "Developer" || permissions.includes("admin.developer");

  const hasPermission = (permission: string) => {
    if (isDeveloper) return true;
    return permissions.includes(permission);
  };

  const hasAllPermissions = (perms: string[]) => {
    if (isDeveloper) return true;
    return perms.every((p) => permissions.includes(p));
  };

  const hasAnyPermission = (perms: string[]) => {
    if (isDeveloper) return true;
    return perms.some((p) => permissions.includes(p));
  };

  const hasRole = (role: string) => {
    if (isDeveloper) return true;
    return roleName === role;
  };

  return {
    admin,
    accessToken,
    isLoading,
    role: roleName,
    isDeveloper,
    permissions,
    hasPermission,
    hasAllPermissions,
    hasAnyPermission,
    hasRole,
  };
}

export function usePermission(permission: string): boolean {
  const { hasPermission } = useAdmin();
  return hasPermission(permission);
}

export function useRole(role: string): boolean {
  const { hasRole } = useAdmin();
  return hasRole(role);
}

interface RequirePermissionProps {
  permission: string;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export const RequirePermission: React.FC<RequirePermissionProps> = ({
  permission,
  fallback = null,
  children,
}) => {
  const isAllowed = usePermission(permission);
  return isAllowed ? <>{children}</> : <>{fallback}</>;
};

interface RequireRoleProps {
  role: string;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export const RequireRole: React.FC<RequireRoleProps> = ({ role, fallback = null, children }) => {
  const isAllowed = useRole(role);
  return isAllowed ? <>{children}</> : <>{fallback}</>;
};
