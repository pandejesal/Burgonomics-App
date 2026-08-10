import { useCallback } from "react";
import { Haptics, ImpactStyle } from "@capacitor/haptics";

export function useFeedback() {
  const triggerHaptic = useCallback(async (style = ImpactStyle.Light) => {
    try {
      await Haptics.impact({ style });
    } catch (e) {
      // Haptics might not be available on web
    }
  }, []);

  const playSound = useCallback((type: "click" | "success" = "click") => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (!audioCtx) return;

      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      if (type === "click") {
        // A very short, unobtrusive click sound
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(600, audioCtx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.05);
        gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.05);
        oscillator.start(audioCtx.currentTime);
        oscillator.stop(audioCtx.currentTime + 0.05);
      } else if (type === "success") {
        // A soft, pleasant double-chime for success (like checkout)
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
        oscillator.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.1); // E5
        gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.2, audioCtx.currentTime + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
        oscillator.start(audioCtx.currentTime);
        oscillator.stop(audioCtx.currentTime + 0.3);
      }
    } catch (e) {
      // AudioContext might be blocked before first user interaction or unavailable
    }
  }, []);

  const triggerClick = useCallback(async () => {
    await triggerHaptic(ImpactStyle.Light);
    playSound("click");
  }, [triggerHaptic, playSound]);

  const triggerSuccess = useCallback(async () => {
    await triggerHaptic(ImpactStyle.Medium);
    playSound("success");
  }, [triggerHaptic, playSound]);

  return { triggerHaptic, playSound, triggerClick, triggerSuccess };
}
