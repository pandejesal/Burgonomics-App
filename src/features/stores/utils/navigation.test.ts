import { describe, it, expect, vi, afterEach } from "vitest";
import { getDirectionsUrl, openDirections } from "./navigation";

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Web platform + a non-Apple user agent → Google Maps branch, never Apple. */
function stubWeb(open = vi.fn()) {
  vi.stubGlobal("window", { open });
  vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Linux; Android 14)" });
  return open;
}

describe("getDirectionsUrl", () => {
  it("emits destination only when no origin is passed", () => {
    expect(getDirectionsUrl(23.0131, 72.5085)).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=23.0131,72.5085",
    );
  });

  it("puts origin ahead of destination when both are finite numbers", () => {
    expect(getDirectionsUrl(23.0131, 72.5085, 19.076, 72.8777)).toBe(
      "https://www.google.com/maps/dir/?api=1&origin=19.076,72.8777&destination=23.0131,72.5085",
    );
  });

  it("drops a partial or non-finite origin instead of writing NaN into the URL", () => {
    const destinationOnly = "https://www.google.com/maps/dir/?api=1&destination=23.0131,72.5085";

    expect(getDirectionsUrl(23.0131, 72.5085, 19.076)).toBe(destinationOnly);
    expect(getDirectionsUrl(23.0131, 72.5085, Number.NaN, 72.8777)).toBe(destinationOnly);
    expect(getDirectionsUrl(23.0131, 72.5085, Number.POSITIVE_INFINITY, 72.8777)).toBe(
      destinationOnly,
    );
    expect(getDirectionsUrl(23.0131, 72.5085, undefined, undefined)).toBe(destinationOnly);
  });
});

describe("openDirections", () => {
  it("opens the Google Maps URL with the origin when coordinates are valid", () => {
    const open = stubWeb();

    openDirections("Burgonomics Bandra", 23.0131, 72.5085, 19.076, 72.8777);

    expect(open).toHaveBeenCalledWith(
      "https://www.google.com/maps/dir/?api=1&origin=19.076,72.8777&destination=23.0131,72.5085",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("falls back to destination only when origin coordinates are omitted", () => {
    const open = stubWeb();

    openDirections("Burgonomics Bandra", 23.0131, 72.5085);

    expect(open).toHaveBeenCalledWith(
      "https://www.google.com/maps/dir/?api=1&destination=23.0131,72.5085",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("ignores an unusable origin pair rather than shipping NaN to Maps", () => {
    const open = stubWeb();

    openDirections("Burgonomics Bandra", 23.0131, 72.5085, Number.NaN, 72.8777);
    openDirections("Burgonomics Bandra", 23.0131, 72.5085, 19.076, undefined);

    expect(open).toHaveBeenCalledTimes(2);
    for (const call of open.mock.calls) {
      expect(call[0]).toBe("https://www.google.com/maps/dir/?api=1&destination=23.0131,72.5085");
    }
  });

  it("routes through Apple Maps with saddr as the origin on iOS", () => {
    const open = vi.fn();
    vi.stubGlobal("window", { open, Capacitor: { getPlatform: () => "ios" } });

    openDirections("Burgonomics Bandra", 23.0131, 72.5085, 19.076, 72.8777);

    expect(open).toHaveBeenCalledWith(
      "https://maps.apple.com/?daddr=23.0131,72.5085&saddr=19.076,72.8777",
      "_blank",
      "noopener,noreferrer",
    );
  });
});
