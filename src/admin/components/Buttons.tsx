import React from "react";
import { motion } from "motion/react";
import { LucideIcon } from "lucide-react";

interface AdminButtonProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "onDrag" | "onDragStart" | "onDragEnd" | "onAnimationStart"
> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "success" | "link";
  size?: "sm" | "md" | "lg";
  icon?: LucideIcon;
  iconPosition?: "left" | "right";
  isLoading?: boolean;
}

export const AdminButton: React.FC<AdminButtonProps> = ({
  children,
  variant = "primary",
  size = "md",
  icon: Icon,
  iconPosition = "left",
  isLoading = false,
  className = "",
  disabled,
  ...props
}) => {
  const isButtonDisabled = disabled || isLoading;

  const baseStyle =
    "inline-flex items-center justify-center gap-2 font-bold font-sans transition-all duration-150 select-none outline-none shadow-sm cursor-pointer";
  let variantStyle = "";
  let sizeStyle = "";

  // Variants
  switch (variant) {
    case "primary":
      variantStyle =
        "bg-[#0E4825] text-white hover:bg-[#0B3A1D] hover:shadow-[0_4px_12px_rgba(14,72,37,0.15)] focus:ring-2 focus:ring-[#0E4825]/20 disabled:bg-gray-100 disabled:text-gray-400 disabled:shadow-none";
      break;
    case "secondary":
      variantStyle =
        "bg-[#FF6600] text-white hover:bg-[#D95700] hover:shadow-[0_4px_12px_rgba(255,102,0,0.15)] focus:ring-2 focus:ring-[#FF6600]/20 disabled:bg-gray-100 disabled:text-gray-400 disabled:shadow-none";
      break;
    case "outline":
      variantStyle =
        "border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900 focus:ring-2 focus:ring-gray-200/50 disabled:bg-gray-50 disabled:text-gray-300 disabled:border-gray-100";
      break;
    case "success":
      variantStyle =
        "bg-[#16A34A] text-white hover:bg-[#117C38] focus:ring-2 focus:ring-[#16A34A]/20 disabled:bg-gray-100 disabled:text-gray-400";
      break;
    case "ghost":
      variantStyle =
        "bg-transparent text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-900 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white shadow-none";
      break;
    case "link":
      variantStyle =
        "bg-transparent text-[#0E4825] dark:text-emerald-400 hover:underline shadow-none p-0 border-none cursor-pointer";
      break;
  }

  // Sizes
  switch (size) {
    case "sm":
      sizeStyle = "px-3.5 py-2 rounded-xl text-xs";
      break;
    case "md":
      sizeStyle = "px-5 py-2.5 rounded-2xl text-sm";
      break;
    case "lg":
      sizeStyle = "px-6 py-3.5 rounded-2xl text-base";
      break;
  }

  return (
    <motion.button
      whileTap={isButtonDisabled ? {} : { scale: 0.98 }}
      className={`${baseStyle} ${variantStyle} ${sizeStyle} ${className}`}
      disabled={isButtonDisabled}
      {...props}
    >
      {isLoading && (
        <svg className="animate-spin -ml-1 h-4 w-4 text-current" fill="none" viewBox="0 0 24 24">
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      )}

      {!isLoading && Icon && iconPosition === "left" && <Icon size={size === "sm" ? 14 : 16} />}
      <span>{children}</span>
      {!isLoading && Icon && iconPosition === "right" && <Icon size={size === "sm" ? 14 : 16} />}
    </motion.button>
  );
};

// DangerButton (red security critical actions)
export const DangerButton: React.FC<AdminButtonProps> = ({
  className = "",
  children,
  ...props
}) => {
  return (
    <AdminButton
      variant="outline"
      className={`border-red-200 dark:border-red-950 text-[#DC2626] bg-red-50/10 dark:bg-red-950/5 hover:bg-red-50 dark:hover:bg-red-950/20 focus:ring-red-100 ${className}`}
      {...props}
    >
      {children}
    </AdminButton>
  );
};
