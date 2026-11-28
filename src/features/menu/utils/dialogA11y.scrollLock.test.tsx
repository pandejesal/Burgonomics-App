/** @vitest-environment jsdom */
/**
 * UX audit 2026-11-26, Customer High #2.
 *
 * The customizer locked only `body`, but styles.css declares the document
 * scroller on `html` (horizontal containment lives there, body is never a
 * scrollport). With the sheet open the menu behind it could still rubber-band.
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { useDialogA11y } from "./dialogA11y";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function Harness({ open }: { open: boolean }) {
  const ref = React.useRef<HTMLDivElement>(null);
  useDialogA11y({ open, onClose: () => {}, containerRef: ref });
  return (
    <div ref={ref}>
      <button type="button">Close customizer</button>
    </div>
  );
}

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  document.documentElement.style.overflow = "";
  document.body.style.overflow = "";
});

describe("customizer document scroll lock", () => {
  it("locks html as well as body while the sheet is open", () => {
    document.documentElement.style.overflow = "";
    document.body.style.overflow = "";
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => root.render(<Harness open />));

    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("restores both scrollers to their previous values on close", () => {
    document.documentElement.style.overflow = "auto";
    document.body.style.overflow = "scroll";
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => root.render(<Harness open />));
    act(() => root.render(<Harness open={false} />));

    expect(document.documentElement.style.overflow).toBe("auto");
    expect(document.body.style.overflow).toBe("scroll");
  });
});
