import * as React from "react";
import { createPortal } from "react-dom";
import { X, Home, Briefcase, MapPin, Navigation } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { HapticService } from "@/core/services/haptics";
import { toUserMessage } from "@/core/errors/userMessages";
import { addressRepository } from "@/features/addresses/repositories/AddressRepository";
import type { Address, AddressLabel } from "@/features/addresses/models";
import { useLocationPermission } from "@/features/stores/hooks/useLocationPermission";

// Leaflet imports
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";

// Orange (Accent) marker pin for the map
const customMarkerHtml = `
  <div style="
    background-color: var(--color-accent);
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50% 50% 50% 0;
    transform: rotate(-45deg);
    box-shadow: 0 6px 12px rgba(194, 65, 12, 0.4);
    border: 3px solid white;
  ">
    <div style="width: 14px; height: 14px; background: white; border-radius: 50%; box-shadow: inset 0 2px 4px rgba(0,0,0,0.2);"></div>
  </div>
`;

const customIcon = L.divIcon({
  html: customMarkerHtml,
  className: "custom-leaflet-marker border-none bg-transparent",
  iconSize: [40, 40],
  iconAnchor: [20, 40],
});

const DEFAULT_CENTER = { lat: 23.0225, lng: 72.5714 }; // Default Ahmedabad, Gujarat

// Android/iOS soft keyboards animate in over a few hundred ms. The reveal is
// re-run once immediately, once on the next frame, and again after this delay
// so the last reflow (viewport fully shrunk) is the one we scroll against.
const KEYBOARD_SETTLE_MS = 300;
// Keep the focused field this far from the scroll box edge so it does not sit
// flush against the sticky header or the fixed save footer.
const REVEAL_GUTTER_PX = 12;

// Everything the customer can change is part of the "unsaved changes" check.
// A baseline of these values is captured whenever the sheet opens; a close
// attempt only counts as discarding input when the live values differ from it.
interface AddressFormValues {
  label: AddressLabel;
  customLabel: string;
  line1: string;
  line2: string;
  landmark: string;
  city: string;
  pincode: string;
  isDefault: boolean;
  lat: number | null;
  lng: number | null;
}

const EMPTY_ADDRESS_VALUES: AddressFormValues = {
  label: "home",
  customLabel: "",
  line1: "",
  line2: "",
  landmark: "",
  city: "",
  pincode: "",
  isDefault: false,
  lat: null,
  lng: null,
};

// Helper component to center map when coordinates change programmatically
function MapController({ center }: { center: { lat: number; lng: number } }) {
  const map = useMap();
  React.useEffect(() => {
    // prefers-reduced-motion: jump straight to the pin instead of animating
    // the flight — large camera motion is the vestibular trigger to avoid.
    const reduceMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      map.setView(center, map.getZoom());
    } else {
      map.flyTo(center, map.getZoom());
    }
  }, [center, map]);
  return null;
}

function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

interface AddressFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  addressToEdit?: Address | null;
  onSuccess?: () => void;
}

/**
 * AddressFormModal — Modal bottom-sheet for creating and editing delivery addresses.
 * Handles address tag selection (Home, Work, Other), a draggable map pin with
 * reverse-geocoding (lat/lng captured into the payload so checkout geofence can
 * verify the location), line 1/2, landmark, city, 6-digit PIN code, and the
 * default address toggle.
 */
export function AddressFormModal({
  isOpen,
  onClose,
  addressToEdit,
  onSuccess,
}: AddressFormModalProps) {
  const [label, setLabel] = React.useState<AddressLabel>("home");
  const [customLabel, setCustomLabel] = React.useState("");
  const [line1, setLine1] = React.useState("");
  const [line2, setLine2] = React.useState("");
  const [landmark, setLandmark] = React.useState("");
  const [city, setCity] = React.useState("");
  const [pincode, setPincode] = React.useState("");
  const [isDefault, setIsDefault] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  // Inline save-validation copy (role="alert"); toasts alone are not
  // perceivable for screen-reader users and vanish too quickly to act on.
  const [validationError, setValidationError] = React.useState<string | null>(null);
  // Synchronous re-entry guard: `setSubmitting(true)` is async, so a second
  // native submit (fast double tap, or Enter + button) can fire handleSubmit
  // again before the disabled button re-renders and create a DUPLICATE saved
  // address. A ref flips synchronously, so only the first submit proceeds.
  const saveInFlightRef = React.useRef(false);
  // Terminal save block (AUTH_CHANGED): the write already committed under the
  // previous session, so Save stays disabled until the sheet is reopened.
  const [saveBlocked, setSaveBlocked] = React.useState(false);
  // Confirmation step shown when a close attempt would discard typed input.
  const [confirmingDiscard, setConfirmingDiscard] = React.useState(false);
  const [mapCenter, setMapCenter] = React.useState(DEFAULT_CENTER);
  // Only coordinates the customer actually confirmed (dragged pin or granted
  // GPS) may be persisted — the default map center is never a real location.
  const [pinPlaced, setPinPlaced] = React.useState(false);
  const markerRef = React.useRef<L.Marker>(null);
  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  // Element focused before the sheet opened; focus returns to it on close so
  // keyboard/SR users land back on the trigger instead of the page root.
  const previousFocusRef = React.useRef<HTMLElement | null>(null);
  // GPS auto-center + auto-geocode runs once per open; later watchPosition
  // fixes must not yank the pin back or overwrite typed fields.
  const autoLocatedRef = React.useRef(false);
  // Monotonic token invalidates stale reverse-geocode responses: each new
  // invocation captures the current token and bails before any setState if a
  // newer invocation (or a modal reset) has started since.
  const geocodeTokenRef = React.useRef(0);
  // Field-level dirty guards, checked *at response time*: an async pin/GPS
  // reverse-geocode may only fill fields the customer has not typed into.
  // Editing an existing address marks every field dirty on load so saved
  // values are never clobbered by a late geocode reply.
  const line1EditedRef = React.useRef(false);
  const cityEditedRef = React.useRef(false);
  const pincodeEditedRef = React.useRef(false);
  // Values the sheet opened with (plus any fill the sheet made itself); used
  // only to decide whether a close attempt needs the discard confirmation.
  const baselineValuesRef = React.useRef<AddressFormValues>(EMPTY_ADDRESS_VALUES);
  // The inline confirm panel is its own focus/trap scope while it is shown.
  const confirmPanelRef = React.useRef<HTMLDivElement | null>(null);
  // Control focused when the confirm step opened; focus returns there on cancel.
  const confirmReturnFocusRef = React.useRef<HTMLElement | null>(null);
  const formId = React.useId();
  const {
    request: requestLocation,
    coords: userCoords,
    status: locationStatus,
    isLoading: isLocating,
  } = useLocationPermission();

  const reverseGeocode = React.useCallback(async (lat: number, lng: number) => {
    const token = ++geocodeTokenRef.current;
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
      );
      const data = await response.json();
      if (token !== geocodeTokenRef.current) return;

      if (data && data.address) {
        const { road, house_number, city: fetchedCity, town, village, postcode } = data.address;

        const bestCity = fetchedCity || town || village;
        if (!cityEditedRef.current && bestCity) setCity(bestCity);
        if (!pincodeEditedRef.current && postcode) setPincode(postcode);

        let streetLine = "";
        if (house_number) streetLine += `${house_number} `;
        if (road) streetLine += road;

        let filledLine1: string | null = null;
        if (!line1EditedRef.current) {
          if (streetLine) {
            const next: string = streetLine.trim();
            filledLine1 = next;
            setLine1(next);
          } else if (data.display_name) {
            const next: string = String(data.display_name).split(",")[0];
            filledLine1 = next;
            setLine1(next);
          }
        }

        // A geocode fill is the sheet acting on its own, not the customer
        // typing, so fold it into the baseline: an untouched address must not
        // look dirty just because GPS landed and filled a few fields.
        const nextBaseline = { ...baselineValuesRef.current };
        if (!cityEditedRef.current && bestCity) nextBaseline.city = bestCity;
        if (!pincodeEditedRef.current && postcode) nextBaseline.pincode = postcode;
        if (filledLine1 != null) nextBaseline.line1 = filledLine1;
        baselineValuesRef.current = nextBaseline;
      }
    } catch (err) {
      console.warn("Reverse geocoding failed", err);
    }
  }, []);

  React.useEffect(() => {
    autoLocatedRef.current = false;
    geocodeTokenRef.current += 1;
    setConfirmingDiscard(false);
    // A reopened sheet starts clean: a terminal AUTH_CHANGED block (and its
    // inline copy) must not survive into a fresh attempt.
    setSaveBlocked(false);
    setValidationError(null);
    saveInFlightRef.current = false;
    if (addressToEdit) {
      // Saved values count as typed: a later geocode reply must not touch them.
      line1EditedRef.current = true;
      cityEditedRef.current = true;
      pincodeEditedRef.current = true;
      setLabel(addressToEdit.label);
      setCustomLabel(addressToEdit.customLabel || "");
      setLine1(addressToEdit.line1);
      setLine2(addressToEdit.line2 || "");
      setLandmark(addressToEdit.landmark || "");
      setCity(addressToEdit.city);
      setPincode(addressToEdit.pincode);
      setIsDefault(addressToEdit.isDefault);
      const hasCoords = Number.isFinite(addressToEdit.lat) && Number.isFinite(addressToEdit.lng);
      setPinPlaced(hasCoords);
      setMapCenter({
        lat: hasCoords ? (addressToEdit.lat as number) : DEFAULT_CENTER.lat,
        lng: hasCoords ? (addressToEdit.lng as number) : DEFAULT_CENTER.lng,
      });
      baselineValuesRef.current = {
        label: addressToEdit.label,
        customLabel: addressToEdit.customLabel || "",
        line1: addressToEdit.line1,
        line2: addressToEdit.line2 || "",
        landmark: addressToEdit.landmark || "",
        city: addressToEdit.city,
        pincode: addressToEdit.pincode,
        isDefault: addressToEdit.isDefault,
        lat: hasCoords ? (addressToEdit.lat as number) : null,
        lng: hasCoords ? (addressToEdit.lng as number) : null,
      };
    } else {
      // No fabricated city: the pin defaults to Ahmedabad, so prefilling
      // "Mumbai" produced a saved address whose city contradicted its pin.
      // City is required and validated on save; reverse-geocode fills it
      // until the customer types their own.
      line1EditedRef.current = false;
      cityEditedRef.current = false;
      pincodeEditedRef.current = false;
      setLabel("home");
      setCustomLabel("");
      setLine1("");
      setLine2("");
      setLandmark("");
      setCity("");
      setPincode("");
      setIsDefault(false);
      setMapCenter(DEFAULT_CENTER);
      setPinPlaced(false);
      baselineValuesRef.current = EMPTY_ADDRESS_VALUES;
    }
  }, [addressToEdit, isOpen]);

  React.useEffect(() => {
    if (isOpen && !Number.isFinite(addressToEdit?.lat)) {
      void requestLocation();
    }
  }, [isOpen, addressToEdit?.lat, requestLocation]);

  React.useEffect(() => {
    if (
      isOpen &&
      !Number.isFinite(addressToEdit?.lat) &&
      locationStatus === "granted" &&
      userCoords &&
      !autoLocatedRef.current
    ) {
      autoLocatedRef.current = true;
      setMapCenter(userCoords);
      setPinPlaced(true);
      // The auto-fix is the sheet's own placement, not the customer's: move
      // the baseline pin with it so an untouched form stays clean.
      baselineValuesRef.current = {
        ...baselineValuesRef.current,
        lat: userCoords.lat,
        lng: userCoords.lng,
      };
      void reverseGeocode(userCoords.lat, userCoords.lng);
    }
  }, [isOpen, locationStatus, userCoords, addressToEdit?.lat, reverseGeocode]);

  const onMarkerDragEnd = React.useCallback(() => {
    const marker = markerRef.current;
    if (marker != null) {
      const position = marker.getLatLng();
      autoLocatedRef.current = true;
      setMapCenter({ lat: position.lat, lng: position.lng });
      setPinPlaced(true);
      void reverseGeocode(position.lat, position.lng);
    }
  }, [reverseGeocode]);

  const handleMapClick = React.useCallback(
    (lat: number, lng: number) => {
      autoLocatedRef.current = true;
      setMapCenter({ lat, lng });
      setPinPlaced(true);
      void reverseGeocode(lat, lng);
    },
    [reverseGeocode],
  );

  // --- Unsaved-changes guard ------------------------------------------------
  // The sheet captures a baseline of its values when it opens; a close attempt
  // (Escape, backdrop, X) only counts as discarding input when the live values
  // differ from that baseline. Writes the sheet makes on its own (GPS auto-fix,
  // async geocode fills) are folded into the baseline, so they never turn an
  // untouched form dirty.
  const currentValues = (): AddressFormValues => ({
    label,
    customLabel,
    line1,
    line2,
    landmark,
    city,
    pincode,
    isDefault,
    lat: pinPlaced ? mapCenter.lat : null,
    lng: pinPlaced ? mapCenter.lng : null,
  });

  const isDirty = () => {
    const opened = baselineValuesRef.current;
    const live = currentValues();
    return (Object.keys(opened) as Array<keyof AddressFormValues>).some(
      (key) => opened[key] !== live[key],
    );
  };

  // Derived each render; also the effect dependency that keeps the reload
  // warning attached exactly while there are unsaved changes.
  const dirty = isDirty();

  // Back out of the confirm step and put focus back where it was, so a
  // keyboard user continues from the field they were editing.
  const cancelDiscard = React.useCallback(() => {
    setConfirmingDiscard(false);
    const target = confirmReturnFocusRef.current;
    confirmReturnFocusRef.current = null;
    // <body> is "connected" but not focusable: fall back to the dialog so the
    // keyboard user is not stranded on a removed button.
    if (target && target !== document.body && target.isConnected) target.focus();
    else dialogRef.current?.focus();
  }, []);

  const discardAndClose = () => {
    setConfirmingDiscard(false);
    onClose();
  };

  const requestClose = () => {
    if (!dirty) {
      onClose();
      return;
    }
    confirmReturnFocusRef.current =
      typeof document !== "undefined" && document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setConfirmingDiscard(true);
  };

  // The document key listener is bound once per open, so it reads the latest
  // closer through this ref instead of re-binding on every keystroke.
  const requestCloseRef = React.useRef(requestClose);
  React.useEffect(() => {
    requestCloseRef.current = requestClose;
  });

  // A reload would drop the typed address just like a close: warn on it while
  // the form is dirty. Route-change blocking is not wired up here (see report).
  React.useEffect(() => {
    if (!isOpen || !dirty || typeof window === "undefined") return undefined;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isOpen, dirty]);

  // --- Soft-keyboard focus reveal -------------------------------------------
  // When the keyboard opens the sheet shrinks *after* the field was focused, so
  // the browser's own scroll-into-view runs against the pre-shrink layout and
  // the focused line ends up below the visible form (the 220px map sits above
  // it). Track the focused control and re-scroll it *inside* the form on every
  // viewport resize, leaving the fixed header and the non-scrolling save footer
  // untouched.
  const formRef = React.useRef<HTMLFormElement | null>(null);
  const focusedFieldRef = React.useRef<HTMLElement | null>(null);
  const revealRafRef = React.useRef<number | null>(null);
  const revealTimerRef = React.useRef<number | null>(null);

  const revealFocusedField = React.useCallback(() => {
    const box = formRef.current;
    const field = focusedFieldRef.current;
    if (!box || !field || !box.contains(field)) return;
    const boxRect = box.getBoundingClientRect();
    const fieldRect = field.getBoundingClientRect();
    // No usable layout (hidden/collapsed) — never guess a scroll offset.
    if (boxRect.height <= 0 || fieldRect.height <= 0) return;
    if (fieldRect.top < boxRect.top + REVEAL_GUTTER_PX) {
      box.scrollTop += fieldRect.top - boxRect.top - REVEAL_GUTTER_PX;
    } else if (fieldRect.bottom > boxRect.bottom - REVEAL_GUTTER_PX) {
      box.scrollTop += fieldRect.bottom - boxRect.bottom + REVEAL_GUTTER_PX;
    }
  }, []);

  const scheduleReveal = React.useCallback(() => {
    if (typeof window === "undefined") return;
    revealFocusedField();
    if (typeof window.requestAnimationFrame === "function") {
      if (revealRafRef.current != null) window.cancelAnimationFrame(revealRafRef.current);
      revealRafRef.current = window.requestAnimationFrame(() => {
        revealRafRef.current = null;
        revealFocusedField();
      });
    }
    if (revealTimerRef.current != null) window.clearTimeout(revealTimerRef.current);
    revealTimerRef.current = window.setTimeout(() => {
      revealTimerRef.current = null;
      revealFocusedField();
    }, KEYBOARD_SETTLE_MS);
  }, [revealFocusedField]);

  React.useEffect(() => {
    if (!isOpen || typeof window === "undefined") return undefined;
    // Keyboard resize is reported by the visual viewport when present, and by
    // window resize otherwise; cover both so the reveal also runs in WebViews
    // that only fire one of them.
    const onViewportChange = () => scheduleReveal();
    window.addEventListener("resize", onViewportChange);
    const viewport = window.visualViewport ?? null;
    viewport?.addEventListener("resize", onViewportChange);
    viewport?.addEventListener("scroll", onViewportChange);
    return () => {
      window.removeEventListener("resize", onViewportChange);
      viewport?.removeEventListener("resize", onViewportChange);
      viewport?.removeEventListener("scroll", onViewportChange);
      if (revealRafRef.current != null) window.cancelAnimationFrame(revealRafRef.current);
      if (revealTimerRef.current != null) window.clearTimeout(revealTimerRef.current);
      revealRafRef.current = null;
      revealTimerRef.current = null;
      focusedFieldRef.current = null;
    };
  }, [isOpen, scheduleReveal]);

  // --- Dialog keyboard contract (mirrors QuickAuthSheet + Radix Dialog) ------
  // Escape closes (or backs out of the discard confirm); Tab is trapped inside
  // the sheet — or inside the confirm panel while it is shown. The listener
  // lives on document but is fully removed on close/unmount, so a closed (or
  // unmounted) sheet can never swallow keys or trap focus.
  React.useEffect(() => {
    if (!isOpen || typeof document === "undefined") return undefined;
    const FOCUSABLE =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (confirmingDiscard) cancelDiscard();
        else requestCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const dialog = confirmingDiscard ? confirmPanelRef.current : dialogRef.current;
      if (!dialog) return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const activeInside = active instanceof HTMLElement && dialog.contains(active);
      if (e.shiftKey) {
        if (!activeInside || active === first || active === dialog) {
          e.preventDefault();
          last.focus();
        }
      } else if (!activeInside || active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, confirmingDiscard, cancelDiscard]);

  // Initial focus lands on the dialog itself (title context for screen
  // readers; the close button is the first Tab stop). On close/unmount focus
  // returns to the opener when it is still in the document — cleanup runs on
  // unmount too, so no focus is stranded inside a removed subtree.
  React.useEffect(() => {
    if (!isOpen || typeof document === "undefined") return undefined;
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    return () => {
      const prev = previousFocusRef.current;
      previousFocusRef.current = null;
      if (prev && prev.isConnected && typeof prev.focus === "function") {
        prev.focus();
      }
    };
  }, [isOpen]);

  const failValidation = (message: string) => {
    setValidationError(message);
    toast.error(message);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Terminal session-change block runs BEFORE clearing the inline copy: a
    // programmatic submit must not blank the alert while the form stays
    // blocked (the remote write already committed under the old account).
    if (saveBlocked) return;
    setValidationError(null);
    // Second submit while the first is still awaiting: ignore it (no second
    // remote write, no second success toast). Checked before the synchronous
    // validation so a rejected first attempt still clears the guard below.
    if (saveInFlightRef.current) return;
    if (!line1.trim()) {
      failValidation("Please enter flat / house / building details");
      return;
    }
    // City is genuinely required (the model demands it) — it starts empty
    // instead of a fake default, so it is validated here like line1/pincode.
    if (!city.trim()) {
      failValidation("Please enter your city");
      return;
    }
    if (!pincode.trim() || pincode.length !== 6) {
      failValidation("Please enter a valid 6-digit pincode");
      return;
    }
    if (!pinPlaced) {
      failValidation("Please tap the map or use 'Locate Me' to pin your delivery location");
      return;
    }

    setSubmitting(true);
    void HapticService.impact("medium");

    const payload = {
      label,
      customLabel: label === "other" ? customLabel : undefined,
      line1: line1.trim(),
      line2: line2.trim() || undefined,
      landmark: landmark.trim() || undefined,
      city: city.trim(),
      pincode: pincode.trim(),
      lat: pinPlaced ? mapCenter.lat : undefined,
      lng: pinPlaced ? mapCenter.lng : undefined,
      isDefault,
    };

    // try/finally: a thrown repository error (e.g. offline) must release the
    // Saving… state instead of leaving the button stuck disabled. The ref is
    // set as the first statement so a throw can never strand it.
    try {
      saveInFlightRef.current = true;
      const res = addressToEdit
        ? await addressRepository.update(addressToEdit.id, payload)
        : await addressRepository.create(payload);
      if (res.success) {
        toast.success(
          addressToEdit ? "Address updated successfully" : "Address saved successfully",
        );
        onSuccess?.();
        onClose();
      } else {
        console.error("[address] save failed:", res.error);
        // AUTH_CHANGED means the remote write already committed under the OLD
        // account, so retrying here would duplicate it. Terminal: keep the
        // typed values, show the repository's own copy, and block Save until
        // the sheet is reopened after signing in. Everything else is a normal
        // retryable failure with curated customer copy.
        const terminal = res.error.code === "AUTH_CHANGED";
        const message = terminal ? res.error.message : toUserMessage(res);
        if (terminal) setSaveBlocked(true);
        // Surface it INLINE as well as in a toast: the sheet stays open (the
        // typed values are preserved), so the persistent role="alert" line is
        // the accessible error a screen-reader user can actually act on.
        setValidationError(message);
        toast.error(message);
      }
    } catch (err) {
      console.error("[address] save threw:", err);
      const message = toUserMessage(err);
      setValidationError(message);
      toast.error(message);
    } finally {
      saveInFlightRef.current = false;
      setSubmitting(false);
    }
  };

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in duration-200"
      onClick={() => {
        // While confirming, the backdrop dismisses the confirm, not the sheet.
        if (confirmingDiscard) cancelDiscard();
        else requestClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="address-modal-title"
        tabIndex={-1}
        className="relative w-full max-w-[500px] max-h-[90dvh] bg-surface rounded-t-3xl sm:rounded-3xl border border-divider shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 duration-300 outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between gap-3 border-b border-divider bg-surface p-4 sm:p-5">
          <h3 id="address-modal-title" className="type-headline-medium text-text">
            {addressToEdit ? "Edit Address" : "Add Delivery Address"}
          </h3>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Close modal"
            className="grid h-11 w-11 place-items-center rounded-full bg-bg-secondary text-text-secondary transition-colors hover:bg-divider hover:text-text cursor-pointer"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        {/* Scrollable Form */}
        <form
          id={formId}
          ref={formRef}
          noValidate
          onSubmit={handleSubmit}
          onFocusCapture={(e) => {
            focusedFieldRef.current = e.target as HTMLElement;
            scheduleReveal();
          }}
          onBlurCapture={() => {
            // Focus moved out of the fields (e.g. the external save button):
            // stop steering the scroll for a field the user is no longer in.
            if (!formRef.current?.contains(document.activeElement)) {
              focusedFieldRef.current = null;
            }
          }}
          className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 no-scrollbar sm:p-6"
        >
          {/* Map pin — drag the pin to set the exact delivery location */}
          <div className="space-y-2">
            <p className="type-label-large text-text-secondary">
              Tap map or drag pin to set location
            </p>
            <div
              className="overflow-hidden rounded-xl border-2 border-primary/10 relative"
              style={{ height: "220px", zIndex: 0 }}
            >
              <div role="img" aria-label="Delivery location map" className="h-full w-full">
                <MapContainer
                  center={mapCenter}
                  zoom={16}
                  zoomControl={false}
                  style={{ height: "100%", width: "100%" }}
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <Marker
                    draggable={true}
                    eventHandlers={{ dragend: onMarkerDragEnd }}
                    position={mapCenter}
                    ref={markerRef}
                    icon={customIcon}
                  />
                  <MapController center={mapCenter} />
                  <MapClickHandler onMapClick={handleMapClick} />
                </MapContainer>
              </div>

              <div className="absolute top-2 right-2" style={{ zIndex: 1000 }}>
                <button
                  type="button"
                  onClick={async () => {
                    const result = await requestLocation();
                    if (result?.coords) {
                      setMapCenter(result.coords);
                      setPinPlaced(true);
                      void reverseGeocode(result.coords.lat, result.coords.lng);
                    }
                  }}
                  disabled={isLocating}
                  className="flex min-h-11 items-center gap-1.5 rounded-full border-2 border-white bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg transition-colors hover:bg-primary-hover cursor-pointer disabled:opacity-50"
                >
                  <Navigation
                    className={cn("h-3.5 w-3.5", isLocating && "animate-spin")}
                    aria-hidden
                  />
                  {isLocating ? "Locating..." : "Locate Me"}
                </button>
              </div>
            </div>
            {(locationStatus === "denied" ||
              locationStatus === "blocked" ||
              locationStatus === "unavailable") && (
              <p role="status" className="text-center text-sm leading-relaxed text-text-secondary">
                Location unavailable — drag the pin manually, or enable location in your browser
                settings and tap Locate Me.
              </p>
            )}
          </div>

          {/* Label Type Selector */}
          <fieldset className="space-y-1.5 border-0 p-0 m-0">
            <legend className="type-label-large p-0 text-text-secondary">Save As</legend>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  void HapticService.selection();
                  setLabel("home");
                }}
                aria-pressed={label === "home"}
                className={cn(
                  "flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors cursor-pointer",
                  label === "home"
                    ? "border-primary bg-primary text-primary-foreground shadow-xs"
                    : "border-divider bg-bg-secondary text-text hover:border-primary/40",
                )}
              >
                <Home className="w-4 h-4" aria-hidden />
                <span>Home</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  void HapticService.selection();
                  setLabel("work");
                }}
                aria-pressed={label === "work"}
                className={cn(
                  "flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors cursor-pointer",
                  label === "work"
                    ? "border-primary bg-primary text-primary-foreground shadow-xs"
                    : "border-divider bg-bg-secondary text-text hover:border-primary/40",
                )}
              >
                <Briefcase className="w-4 h-4" aria-hidden />
                <span>Work</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  void HapticService.selection();
                  setLabel("other");
                }}
                aria-pressed={label === "other"}
                className={cn(
                  "flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors cursor-pointer",
                  label === "other"
                    ? "border-primary bg-primary text-primary-foreground shadow-xs"
                    : "border-divider bg-bg-secondary text-text hover:border-primary/40",
                )}
              >
                <MapPin className="w-4 h-4" aria-hidden />
                <span>Other</span>
              </button>
            </div>
          </fieldset>

          {/* Custom Label if Other */}
          {label === "other" && (
            <div className="space-y-1">
              <label
                htmlFor="address-modal-nickname"
                className="type-label-large text-text-secondary"
              >
                Nickname / Tag
              </label>
              <input
                id="address-modal-nickname"
                type="text"
                maxLength={30}
                placeholder="e.g. Friends House, Gym"
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value.slice(0, 30))}
                className="w-full min-h-11 rounded-xl border border-divider bg-bg-secondary px-3.5 py-2.5 text-base font-medium text-text outline-none focus:border-primary"
              />
            </div>
          )}

          {/* Flat / Building */}
          <div className="space-y-1">
            <label htmlFor="address-modal-line1" className="type-label-large text-text-secondary">
              Flat / House / Building *
            </label>
            <input
              id="address-modal-line1"
              type="text"
              required
              placeholder="e.g. Flat 402, Sunshine Heights"
              value={line1}
              onChange={(e) => {
                setLine1(e.target.value);
                line1EditedRef.current = true;
              }}
              className="w-full min-h-11 rounded-xl border border-divider bg-bg-secondary px-3.5 py-2.5 text-base font-medium text-text outline-none focus:border-primary"
            />
          </div>

          {/* Area / Street */}
          <div className="space-y-1">
            <label htmlFor="address-modal-line2" className="type-label-large text-text-secondary">
              Area / Street
            </label>
            <input
              id="address-modal-line2"
              type="text"
              placeholder="e.g. Linking Road, Bandra West"
              value={line2}
              onChange={(e) => setLine2(e.target.value)}
              className="w-full min-h-11 rounded-xl border border-divider bg-bg-secondary px-3.5 py-2.5 text-base font-medium text-text outline-none focus:border-primary"
            />
          </div>

          {/* Landmark & Pincode Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label
                htmlFor="address-modal-landmark"
                className="type-label-large text-text-secondary"
              >
                Landmark
              </label>
              <input
                id="address-modal-landmark"
                type="text"
                placeholder="e.g. Near Metro Station"
                value={landmark}
                onChange={(e) => setLandmark(e.target.value)}
                className="w-full min-h-11 rounded-xl border border-divider bg-bg-secondary px-3.5 py-2.5 text-base font-medium text-text outline-none focus:border-primary"
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="address-modal-pincode"
                className="type-label-large text-text-secondary"
              >
                Pincode *
              </label>
              <input
                id="address-modal-pincode"
                type="text"
                required
                inputMode="numeric"
                maxLength={6}
                placeholder="e.g. 400050"
                value={pincode}
                onChange={(e) => {
                  setPincode(e.target.value.replace(/\D/g, ""));
                  pincodeEditedRef.current = true;
                }}
                className="w-full min-h-11 rounded-xl border border-divider bg-bg-secondary px-3.5 py-2.5 text-base font-semibold tabular-nums text-text outline-none focus:border-primary"
              />
            </div>
          </div>

          {/* City */}
          <div className="space-y-1">
            <label htmlFor="address-modal-city" className="type-label-large text-text-secondary">
              City *
            </label>
            <input
              id="address-modal-city"
              type="text"
              required
              placeholder="e.g. Mumbai"
              value={city}
              onChange={(e) => {
                setCity(e.target.value);
                cityEditedRef.current = true;
              }}
              className="w-full min-h-11 rounded-xl border border-divider bg-bg-secondary px-3.5 py-2.5 text-base font-medium text-text outline-none focus:border-primary"
            />
          </div>

          {/* Inline save-validation copy — announced via role="alert" */}
          {validationError && (
            <div role="alert" className="p-3 rounded-xl bg-error/10 border border-error/20">
              <p className="text-center text-sm font-semibold text-error">{validationError}</p>
            </div>
          )}

          {/* Default Toggle */}
          <label className="flex min-h-11 cursor-pointer select-none items-center gap-3 pt-2">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="h-5 w-5 cursor-pointer rounded-sm accent-primary"
            />
            <span className="text-sm font-medium text-text">Set as default delivery address</span>
          </label>
        </form>
        {/* Keep the save action outside the scrolling fields. The primary CTA
              uses the semantic primary pair (primary bg + primary-foreground
              label) rather than a raw orange fill, so it inherits the theme's
              contrast guarantees in both light and dark. */}
        <div className="shrink-0 border-t border-divider p-4 pb-[calc(16px+env(safe-area-inset-bottom,0px))]">
          <button
            type="submit"
            form={formId}
            disabled={submitting || saveBlocked}
            aria-disabled={submitting || saveBlocked}
            className="min-h-12 w-full rounded-xl bg-primary px-4 py-3 text-base font-semibold text-primary-foreground shadow-md transition-colors hover:bg-primary-hover active:scale-[0.98] cursor-pointer disabled:opacity-50"
          >
            {submitting
              ? "Saving..."
              : saveBlocked
                ? "Reopen to retry"
                : addressToEdit
                  ? "Update Address"
                  : "Save Address"}
          </button>
        </div>

        {/* Discard confirmation — inline step so Escape/backdrop/X never
            silently drop typed input. Focus lands on the safe action and the
            Tab trap above is scoped to this panel while it is shown. */}
        {confirmingDiscard && (
          <div
            className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 p-4 animate-in fade-in duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              ref={confirmPanelRef}
              role="alertdialog"
              aria-labelledby="address-discard-title"
              aria-describedby="address-discard-desc"
              className="w-full max-w-[380px] rounded-2xl border border-divider bg-surface p-5 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150"
            >
              <h4 id="address-discard-title" className="type-title-large text-text">
                Discard changes?
              </h4>
              <p id="address-discard-desc" className="text-sm leading-relaxed text-text-secondary">
                Your unsaved changes to this address will be lost.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  autoFocus
                  onClick={cancelDiscard}
                  className="min-h-11 flex-1 rounded-xl border border-divider bg-bg-secondary text-sm font-semibold text-text transition-colors hover:border-primary/40 cursor-pointer"
                >
                  Keep editing
                </button>
                <button
                  type="button"
                  onClick={discardAndClose}
                  className="min-h-11 flex-1 rounded-xl bg-error text-sm font-semibold text-white transition-colors hover:brightness-110 cursor-pointer"
                >
                  Discard
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export default AddressFormModal;
