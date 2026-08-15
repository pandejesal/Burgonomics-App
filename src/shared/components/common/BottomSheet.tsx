import * as React from "react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { HapticService } from "@/core/services/haptics";

interface BottomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
}

/** BottomSheet — wraps shadcn Drawer with design-system defaults and tactile opening haptics. */
export function BottomSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
}: BottomSheetProps) {
  React.useEffect(() => {
    if (open) {
      void HapticService.impact("light");
    }
  }, [open]);

  return (
    <Drawer open={open} onOpenChange={onOpenChange} handleOnly shouldScaleBackground>
      <DrawerContent className="mx-auto max-w-[480px] md:max-w-[480px] max-md:max-w-full shadow-high border-t border-divider/60">
        {(title || description) && (
          <DrawerHeader className="text-left">
            {title && <DrawerTitle>{title}</DrawerTitle>}
            {description && <DrawerDescription>{description}</DrawerDescription>}
          </DrawerHeader>
        )}
        <div className="px-4 pb-6 overflow-y-auto max-h-[calc(85dvh-4rem)] [overscroll-behavior-y:contain]">{children}</div>
      </DrawerContent>
    </Drawer>
  );
}
