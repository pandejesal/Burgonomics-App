/**
 * B02 offline Playwright harness entry — renders the REAL AppButton
 * (no mocks) into the static cases of app-button-harness.template.html.
 * Bundled to an IIFE and inlined by build-harness.mjs; the spec drives the
 * page over file://, so there is no server and no port to collide with.
 *
 * Not picked up by vitest (name is not *.test.tsx) and not part of the app
 * tsconfig — it is a test asset only.
 */
import * as React from "react";
import { createRoot } from "react-dom/client";
import { AppButton } from "@/shared/components/common/AppButton";

interface Counts {
  submits: number;
  clicks: number;
}

type Bag = Record<string, Counts | { submits: number }>;
const bag = () => (window as unknown as { __B02__: Bag }).__B02__;

const mountForm = (
  id: string,
  key: keyof Bag,
  button: React.ReactElement,
  onSubmitExtra?: (e: React.FormEvent) => void,
) => {
  const form = (
    <form
      id={`${id}-form`}
      onSubmit={(e) => {
        e.preventDefault(); // stay on the harness page
        (bag()[key] as Counts).submits += 1;
        onSubmitExtra?.(e);
      }}
    >
      {button}
    </form>
  );
  createRoot(document.getElementById(id) as HTMLElement).render(form);
};

// Case 1 — submit button inside the form (the common consumer shape).
mountForm(
  "mount-inside",
  "inside",
  <AppButton
    type="submit"
    onClick={() => {
      (bag().inside as Counts).clicks += 1;
    }}
  >
    Place order
  </AppButton>,
);

// Case 2 — footer association: button in its own root, form="…" outside it.
createRoot(document.getElementById("mount-footer") as HTMLElement).render(
  <AppButton
    type="submit"
    form="footer-form"
    onClick={() => {
      (bag().footer as Counts).clicks += 1;
    }}
  >
    Pay from footer
  </AppButton>,
);

// Case 3 — onClick calls preventDefault: native submission must not happen.
mountForm(
  "mount-prevented",
  "prevented",
  <AppButton
    type="submit"
    onClick={(e) => {
      (bag().prevented as Counts).clicks += 1;
      e.preventDefault();
    }}
  >
    Intercept
  </AppButton>,
);

// Case 4 — loading lock: nothing may fire at all.
mountForm(
  "mount-loading",
  "loading",
  <AppButton
    type="submit"
    loading
    onClick={() => {
      (bag().loading as Counts).clicks += 1;
    }}
  >
    Processing
  </AppButton>,
);

// Case 5 — default type=button must not submit the surrounding form.
mountForm(
  "mount-normal",
  "normal",
  <AppButton
    onClick={() => {
      (bag().normal as Counts).clicks += 1;
    }}
  >
    Add to cart
  </AppButton>,
);

// Case 6 — keyboard: native Enter activation on a real submit button.
mountForm("mount-keyboard", "keyboard", <AppButton type="submit">Pay</AppButton>);
