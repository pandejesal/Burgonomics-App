import * as React from "react";
import { useCallback, useState, useEffect, useRef } from "react";
import { Home, Briefcase, MapPin, Navigation } from "lucide-react";
import { AppButton } from "@/shared/components/common/AppButton";
import { TextField } from "@/shared/components/common/TextField";
import { Text } from "@/shared/components/common/Text";
import { cn } from "@/lib/utils";
import { addressRepository } from "@/features/addresses/repositories/AddressRepository";
import type { Address, AddressLabel } from "@/features/addresses/models";
import { useProfileStore } from "@/features/profile/state/profileStore";
import { useLocationPermission } from "@/features/stores/hooks/useLocationPermission";
import { HapticService } from "@/core/services/haptics";

// Leaflet imports
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";

// Create a custom Orange (Accent 10%) marker pin for the map
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
    box-shadow: 0 6px 12px rgba(255, 102, 0, 0.4);
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

interface Props {
  initial?: Address;
  onCancel: () => void;
  onSaved: (a: Address | { id: string }) => void;
}

const LABELS: Array<{ value: AddressLabel; label: string; Icon: typeof Home }> = [
  { value: "home", label: "Home", Icon: Home },
  { value: "work", label: "Work", Icon: Briefcase },
  { value: "other", label: "Other", Icon: MapPin },
];

const DEFAULT_CENTER = { lat: 23.0225, lng: 72.5714 }; // Default Ahmedabad, Gujarat

// Helper component to center map when coordinates change programmatically
function MapController({ center }: { center: { lat: number; lng: number } }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, map.getZoom());
  }, [center, map]);
  return null;
}

export function AddressForm({ initial, onCancel, onSaved }: Props) {
  const profile = useProfileStore((s) => s.profile);
  const {
    request: requestLocation,
    coords: userCoords,
    status: locationStatus,
    isLoading: isLocating,
  } = useLocationPermission();

  const [label, setLabel] = useState<AddressLabel>(initial?.label ?? "home");
  const [customLabel, setCustomLabel] = useState(initial?.customLabel ?? "");
  const [line1, setLine1] = useState(initial?.line1 ?? "");
  const [line2, setLine2] = useState(initial?.line2 ?? "");
  const [landmark, setLandmark] = useState(initial?.landmark ?? "");
  const [city, setCity] = useState(initial?.city ?? "");
  const [state, setState] = useState(initial?.state ?? "Gujarat");
  const [pincode, setPincode] = useState(initial?.pincode ?? "");
  const [isDefault, setIsDefault] = useState(initial?.isDefault ?? false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [mapCenter, setMapCenter] = useState({
    lat: initial?.lat || DEFAULT_CENTER.lat,
    lng: initial?.lng || DEFAULT_CENTER.lng,
  });

  const markerRef = useRef<L.Marker>(null);

  const reverseGeocode = useCallback(async (lat: number, lng: number) => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
      );
      const data = await response.json();

      if (data && data.address) {
        const {
          road,
          house_number,
          city: fetchedCity,
          town,
          village,
          postcode,
          state: fetchedState,
        } = data.address;

        const bestCity = fetchedCity || town || village;
        if (bestCity) setCity(bestCity);
        if (postcode) setPincode(postcode);
        if (fetchedState) setState(fetchedState);

        let streetLine = "";
        if (house_number) streetLine += `${house_number} `;
        if (road) streetLine += road;

        if (streetLine) {
          setLine1(streetLine.trim());
        } else if (data.display_name) {
          setLine1(data.display_name.split(",")[0]);
        }
      }
    } catch (err) {
      console.warn("Reverse geocoding failed", err);
    }
  }, []);

  useEffect(() => {
    if (!initial?.lat) {
      void requestLocation();
    }
  }, [initial?.lat, requestLocation]);

  useEffect(() => {
    if (!initial?.lat && locationStatus === "granted" && userCoords) {
      setMapCenter(userCoords);
      reverseGeocode(userCoords.lat, userCoords.lng);
    }
  }, [locationStatus, userCoords, initial?.lat, reverseGeocode]);

  const onMarkerDragEnd = useCallback(() => {
    const marker = markerRef.current;
    if (marker != null) {
      const position = marker.getLatLng();
      setMapCenter({ lat: position.lat, lng: position.lng });
      reverseGeocode(position.lat, position.lng);
    }
  }, [reverseGeocode]);

  const handleInputFocus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    e.target.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Dismiss keyboard on submit
    if (typeof window !== "undefined" && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    try {
      const { Keyboard } = await import("@capacitor/keyboard");
      await Keyboard.hide();
    } catch {
      // Keyboard plugin not active
    }

    setBusy(true);

    const payload = {
      label,
      customLabel: label === "other" ? customLabel.trim() || undefined : undefined,
      contactName: profile?.fullName || "Guest Customer",
      contactPhone: profile?.phone || "0000000000",
      line1: line1.trim(),
      line2: line2.trim() || undefined,
      landmark: landmark.trim() || undefined,
      city: city.trim(),
      state: state.trim() || "Gujarat",
      pincode: pincode.replace(/\D/g, "").slice(0, 6),
      lat: mapCenter.lat,
      lng: mapCenter.lng,
      isDefault,
    };

    const res = initial
      ? await addressRepository.update(initial.id, payload)
      : await addressRepository.create(payload);

    setBusy(false);
    if (!res.success) {
      setError(res.error.message);
      return;
    }
    void HapticService.notification("success");
    onSaved(initial ? { id: initial.id } : (res.data as Address));
  };

  return (
    <div className="space-y-6 pb-28">
      {/* 60-30-10 Brand Header */}
      <div className="text-center space-y-1">
        <h2 className="type-headline-large text-primary">WHERE'S THE FOOD GOING?</h2>
        <p className="type-body-medium text-text-secondary font-medium">
          Drag the orange pin to set your exact location
        </p>
      </div>

      {/* Map Section */}
      <div
        className="overflow-hidden rounded-[var(--radius-large)] border-[3px] border-primary/10 shadow-brand relative"
        style={{ height: "260px", zIndex: 0 }}
      >
        <MapContainer center={mapCenter} zoom={16} style={{ height: "100%", width: "100%" }}>
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
        </MapContainer>

        <div className="absolute top-3 right-3" style={{ zIndex: 1000 }}>
          <button
            type="button"
            onClick={() => requestLocation()}
            disabled={isLocating}
            className="flex items-center gap-2 rounded-full bg-accent px-4 py-2.5 shadow-lg shadow-accent/40 hover:bg-accent/90 text-white transition-all type-label-large border-2 border-white cursor-pointer"
          >
            <Navigation className={cn("h-4 w-4", isLocating && "animate-spin")} />
            {isLocating ? "Locating..." : "Locate Me"}
          </button>
        </div>

        <div
          className="absolute bottom-0 w-full bg-primary/95 backdrop-blur-sm p-2.5 text-center text-white"
          style={{ zIndex: 1000 }}
        >
          <span className="type-caption tracking-widest uppercase">
            Double check your pin drop!
          </span>
        </div>
      </div>

      {/* Form Fields */}
      <form
        id="address-entry-form"
        onSubmit={submit}
        className="space-y-5 bg-surface rounded-[var(--radius-large)] p-1"
      >
        <fieldset>
          <legend className="type-label-large uppercase text-primary mb-3 tracking-wide">
            Save as
          </legend>
          <div className="flex gap-3">
            {LABELS.map((opt) => {
              const active = label === opt.value;
              const Icon = opt.Icon;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    void HapticService.impact("light");
                    setLabel(opt.value);
                  }}
                  aria-pressed={active}
                  className={cn(
                    "flex-1 inline-flex flex-col items-center justify-center gap-1.5 rounded-[var(--radius-medium)] border-2 py-3 transition-all cursor-pointer",
                    active
                      ? "border-accent bg-accent/10 text-accent shadow-sm"
                      : "border-divider bg-bg-secondary text-text-secondary hover:border-accent/40",
                  )}
                >
                  <Icon className="h-5 w-5" aria-hidden />
                  <span className="type-caption font-bold">{opt.label}</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        {label === "other" && (
          <TextField
            label="Nickname"
            placeholder="e.g. Parents' place"
            value={customLabel}
            onFocus={handleInputFocus}
            onChange={(e) => setCustomLabel(e.target.value.slice(0, 30))}
          />
        )}

        <div className="space-y-4 pt-2">
          <TextField
            label="Flat / house / building"
            value={line1}
            onFocus={handleInputFocus}
            onChange={(e) => setLine1(e.target.value)}
            autoComplete="address-line1"
            required
          />
          <TextField
            label="Area / street (optional)"
            value={line2}
            onFocus={handleInputFocus}
            onChange={(e) => setLine2(e.target.value)}
            autoComplete="address-line2"
          />
          <TextField
            label="Landmark (optional)"
            value={landmark}
            onFocus={handleInputFocus}
            onChange={(e) => setLandmark(e.target.value)}
            placeholder="Near…"
          />
          <div className="grid grid-cols-2 gap-4">
            <TextField
              label="City"
              value={city}
              onFocus={handleInputFocus}
              onChange={(e) => setCity(e.target.value)}
              autoComplete="address-level2"
              required
            />
            <TextField
              label="State"
              value={state}
              onFocus={handleInputFocus}
              onChange={(e) => setState(e.target.value)}
              autoComplete="address-level1"
              required
            />
          </div>
          <TextField
            label="Pincode"
            type="tel"
            inputMode="numeric"
            maxLength={6}
            value={pincode}
            onFocus={handleInputFocus}
            onChange={(e) => setPincode(e.target.value.replace(/\D/g, ""))}
            autoComplete="postal-code"
            required
          />
        </div>

        <label className="flex items-center gap-3 p-3 mt-2 rounded-[var(--radius-small)] bg-bg-secondary border border-divider cursor-pointer">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
            className="h-5 w-5 accent-primary rounded cursor-pointer"
          />
          <span className="type-body-medium font-semibold text-primary">
            Make this my default address
          </span>
        </label>

        {error && (
          <div
            role="alert"
            className="p-3 rounded-[var(--radius-small)] bg-error/10 border border-error/20"
          >
            <Text variant="bodyMedium" tone="error" className="font-semibold text-center block">
              {error}
            </Text>
          </div>
        )}
      </form>

      {/* Sticky Save Bar pinned to bottom sitting above keyboard */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-divider bg-surface/95 backdrop-blur-md px-4 py-3 pb-[calc(12px+env(safe-area-inset-bottom,0px))] shadow-high">
        <div className="mx-auto flex max-w-[560px] items-center gap-3">
          <AppButton
            type="button"
            variant="outlined"
            onClick={onCancel}
            className="border-2 font-bold text-text-secondary border-divider shrink-0 px-5"
          >
            CANCEL
          </AppButton>
          <AppButton
            type="submit"
            form="address-entry-form"
            fullWidth
            loading={busy}
            variant="cta"
            className="font-bold shadow-brand"
          >
            {initial ? "SAVE CHANGES" : "SAVE ADDRESS"}
          </AppButton>
        </div>
      </div>
    </div>
  );
}
