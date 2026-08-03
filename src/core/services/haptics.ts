import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { isNative } from "@/shared/platform/platform";

export class HapticService {
  /**
   * Trigger physical haptic impact feedback (light, medium, heavy)
   */
  static async impact(style: "light" | "medium" | "heavy" = "light") {
    if (isNative()) {
      try {
        let capStyle = ImpactStyle.Light;
        if (style === "medium") capStyle = ImpactStyle.Medium;
        if (style === "heavy") capStyle = ImpactStyle.Heavy;
        await Haptics.impact({ style: capStyle });
        return;
      } catch {
        /* ignore */
      }
    }

    // Fallback to web vibration
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        if (style === "heavy") navigator.vibrate(20);
        else if (style === "medium") navigator.vibrate(15);
        else navigator.vibrate(10);
      } catch {
        // ignore security or iframe restrictions
      }
    }
  }

  /**
   * Trigger physical notification feedback (success, warning, error)
   */
  static async notification(type: "success" | "warning" | "error" = "success") {
    if (isNative()) {
      try {
        let capType = NotificationType.Success;
        if (type === "warning") capType = NotificationType.Warning;
        if (type === "error") capType = NotificationType.Error;
        await Haptics.notification({ type: capType });
        return;
      } catch {
        /* ignore */
      }
    }

    // Fallback to web vibration
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        if (type === "success") {
          navigator.vibrate([10, 40, 10]);
        } else if (type === "warning") {
          navigator.vibrate([20, 80, 20]);
        } else if (type === "error") {
          navigator.vibrate([30, 80, 30, 80, 30]);
        }
      } catch {
        // ignore security/iframe restrictions
      }
    }
  }

  /**
   * Trigger selection change feedback (very subtle, good for toggles/switches)
   */
  static async selection() {
    if (isNative()) {
      try {
        await Haptics.selectionChanged();
        return;
      } catch {
        /* ignore */
      }
    }

    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(8);
      } catch {
        // ignore
      }
    }
  }
}
