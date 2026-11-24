import * as React from "react";
import { useEffect, useId, useRef, useState } from "react";
import {
  bindHost,
  releaseHost,
  renderFlow,
  type RecaptchaSize,
} from "@/features/auth/state/authBinding";
import type { AuthFlowId } from "@/features/auth/utils/authErrors";

export interface RecaptchaHostProps {
  flow: AuthFlowId;
}

/**
 * One connected, zero-layout DOM anchor per logical auth flow. Firebase renders
 * an invisible verifier here; Continue executes the challenge through
 * signInWithPhoneNumber, so no checkbox or visible-widget space is required.
 */
export function RecaptchaHost({ flow }: RecaptchaHostProps) {
  const reactId = useId();
  const hostId = `host_${reactId.replace(/[^A-Za-z0-9_-]/g, "")}`;
  const elementRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<RecaptchaSize | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    let cancelled = false;

    const result = bindHost(flow, hostId, element);
    if (result.ok) {
      setSize(result.size);
      setFailed(false);
      // Prepare the invisible challenge. Continue, not this render, executes it.
      void renderFlow(flow).then((outcome) => {
        if (cancelled) return;
        if (outcome === "unavailable") {
          setFailed(true);
        }
      });
    } else {
      setFailed(true);
    }

    return () => {
      cancelled = true;
      releaseHost(flow, hostId);
    };
  }, [flow, hostId]);

  return (
    <div className="flex w-full min-w-0 flex-col items-center">
      {/* The reCAPTCHA SDK owns the children of this node. Never render React
          children inside it, or a re-render can fight the widget's iframe. */}
      <div
        ref={elementRef}
        id={`recaptcha-${hostId}`}
        data-recaptcha-flow={flow}
        data-recaptcha-size={size ?? undefined}
        data-recaptcha-failed={failed ? "true" : undefined}
        className="mx-auto h-px w-px"
      />
      {failed && (
        <p className="py-2 text-center text-sm text-text-secondary" role="status">
          We couldn't load the security check. Check your connection and try again.
        </p>
      )}
    </div>
  );
}
