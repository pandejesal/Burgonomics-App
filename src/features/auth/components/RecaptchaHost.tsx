import * as React from "react";
import { useEffect, useId, useRef, useState } from "react";
import {
  bindHost,
  releaseHost,
  type RecaptchaSize,
} from "@/features/auth/state/authBinding";
import type { AuthFlowId } from "@/features/auth/utils/authErrors";

const MAX_FRAME_RETRIES = 10;

export interface RecaptchaHostProps {
  flow: AuthFlowId;
  /** Test seam: jsdom reports clientWidth 0. Browsers use clientWidth. */
  measure?: (element: HTMLElement) => number;
}

/**
 * One DOM anchor per logical auth flow. The verifier is constructed from this
 * element ref (never a global id), so a mounted login form and the checkout
 * sheet cannot overwrite each other's challenge widget.
 */
export function RecaptchaHost({ flow, measure }: RecaptchaHostProps) {
  const reactId = useId();
  const hostId = `host_${reactId.replace(/[^A-Za-z0-9_-]/g, "")}`;
  const elementRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<RecaptchaSize | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    let cancelled = false;
    let frame: number | null = null;
    let attempts = 0;

    const cancel = () => {
      if (frame === null) return;
      if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame);
      else clearTimeout(frame);
      frame = null;
    };

    const bind = () => {
      if (cancelled) return;
      const width = measure ? measure(element) : element.clientWidth;
      if (!Number.isFinite(width) || width <= 0) {
        if (attempts >= MAX_FRAME_RETRIES) {
          setFailed(true);
          return;
        }
        attempts += 1;
        if (typeof requestAnimationFrame === "function") {
          frame = requestAnimationFrame(bind);
        } else {
          frame = setTimeout(bind, 16) as unknown as number;
        }
        return;
      }
      const result = bindHost(flow, hostId, element, () => width);
      if (result.ok) {
        setSize(result.size);
        setFailed(false);
      } else {
        setFailed(true);
      }
    };

    bind();

    return () => {
      cancelled = true;
      cancel();
      releaseHost(flow, hostId);
    };
  }, [flow, hostId, measure]);

  return (
    <div
      ref={elementRef}
      id={`recaptcha-${hostId}`}
      data-recaptcha-flow={flow}
      data-recaptcha-size={size ?? undefined}
      data-recaptcha-failed={failed ? "true" : undefined}
      className="mx-auto flex w-full min-w-0 max-w-full justify-center overflow-hidden"
    />
  );
}
