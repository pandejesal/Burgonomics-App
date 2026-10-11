import * as React from "react";
import { X, Home, Briefcase, MapPin, Check, Navigation } from "lucide-react";
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

// Helper component to center map when coordinates change programmatically
function MapController({ center }: { center: { lat: number; lng: number } }) {
  const map = useMap();
  React.useEffect(() => {
    map.flyTo(center, map.getZoom());
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
  const [city, setCity] = React.useState("Mumbai");
  const [pincode, setPincode] = React.useState("");
  const [isDefault, setIsDefault] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [mapCenter, setMapCenter] = React.useState(DEFAULT_CENTER);
  // Only coordinates the customer actually confirmed (dragged pin or granted
  // GPS) may be persisted — the default map center is never a real location.
  const [pinPlaced, setPinPlaced] = React.useState(false);
  const markerRef = React.useRef<L.Marker>(null);
  // GPS auto-center + auto-geocode runs once per open; later watchPosition
  // fixes must not yank the pin back or overwrite typed fields.
  const autoLocatedRef = React.useRef(false);
  // Monotonic token invalidates stale reverse-geocode responses: each new
  // invocation captures the current token and bails before any setState if a
  // newer invocation (or a modal reset) has started since.
  const geocodeTokenRef = React.useRef(0);
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
        const {
          road,
          house_number,
          city: fetchedCity,
          town,
          village,
          postcode,
        } = data.address;

        const bestCity = fetchedCity || town || village;
        if (bestCity) setCity(bestCity);
        if (postcode) setPincode(postcode);

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

  React.useEffect(() => {
    autoLocatedRef.current = false;
    geocodeTokenRef.current += 1;
    if (addressToEdit) {
      setLabel(addressToEdit.label);
      setCustomLabel(addressToEdit.customLabel || "");
      setLine1(addressToEdit.line1);
      setLine2(addressToEdit.line2 || "");
      setLandmark(addressToEdit.landmark || "");
      setCity(addressToEdit.city);
      setPincode(addressToEdit.pincode);
      setIsDefault(addressToEdit.isDefault);
      const hasCoords =
        Number.isFinite(addressToEdit.lat) && Number.isFinite(addressToEdit.lng);
      setPinPlaced(hasCoords);
      setMapCenter({
        lat: hasCoords ? (addressToEdit.lat as number) : DEFAULT_CENTER.lat,
        lng: hasCoords ? (addressToEdit.lng as number) : DEFAULT_CENTER.lng,
      });
    } else {
      setLabel("home");
      setCustomLabel("");
      setLine1("");
      setLine2("");
      setLandmark("");
      setCity("Mumbai");
      setPincode("");
      setIsDefault(false);
      setMapCenter(DEFAULT_CENTER);
      setPinPlaced(false);
    }
  }, [addressToEdit, isOpen]);

  React.useEffect(() => {
    if (isOpen && !Number.isFinite(addressToEdit?.lat)) {
      void requestLocation();
    }
  }, [isOpen, addressToEdit?.lat, requestLocation]);

  React.useEffect(() => {
    if (isOpen && !Number.isFinite(addressToEdit?.lat) && locationStatus === "granted" && userCoords && !autoLocatedRef.current) {
      autoLocatedRef.current = true;
      setMapCenter(userCoords);
      setPinPlaced(true);
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

  const handleMapClick = React.useCallback((lat: number, lng: number) => {
    autoLocatedRef.current = true;
    setMapCenter({ lat, lng });
    setPinPlaced(true);
    void reverseGeocode(lat, lng);
  }, [reverseGeocode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!line1.trim()) {
      toast.error("Please enter flat / house / building details");
      return;
    }
    if (!pincode.trim() || pincode.length !== 6) {
      toast.error("Please enter a valid 6-digit pincode");
      return;
    }
    if (!pinPlaced) {
      toast.error("Please tap the map or use 'Locate Me' to pin your delivery location");
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

    if (addressToEdit) {
      const res = await addressRepository.update(addressToEdit.id, payload);
      setSubmitting(false);
      if (res.success) {
        toast.success("Address updated successfully");
        onSuccess?.();
        onClose();
      } else {
        console.error("[address] update failed:", res.error);
        toast.error(toUserMessage(res));
      }
    } else {
      const res = await addressRepository.create(payload);
      setSubmitting(false);
      if (res.success) {
        toast.success("Address saved successfully");
        onSuccess?.();
        onClose();
      } else {
        console.error("[address] create failed:", res.error);
        toast.error(toUserMessage(res));
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-[500px] max-h-[90vh] bg-surface rounded-t-3xl sm:rounded-3xl border border-divider shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-divider flex items-center justify-between bg-surface sticky top-0 z-10">
          <h3 className="text-base sm:text-lg font-black text-text">
            {addressToEdit ? "Edit Address" : "Add Delivery Address"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="w-10 h-10 min-w-[44px] min-h-[44px] rounded-full bg-bg-secondary hover:bg-divider flex items-center justify-center text-text-secondary hover:text-text transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 overflow-y-auto max-h-[calc(90vh-140px)] no-scrollbar">
          {/* Map pin — drag the orange pin to set the exact delivery location */}
          <div className="space-y-1.5">
            <p className="text-xs font-bold text-text-secondary uppercase tracking-wider">
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
                  className="flex items-center gap-1.5 rounded-full bg-accent px-4 py-2.5 min-h-[44px] shadow-lg shadow-accent/40 hover:bg-accent/90 text-white text-xs font-bold transition-all border-2 border-white cursor-pointer disabled:opacity-50"
                >
                  <Navigation className={cn("h-3.5 w-3.5", isLocating && "animate-spin")} />
                  {isLocating ? "Locating..." : "Locate Me"}
                </button>
              </div>
            </div>
            {(locationStatus === "denied" ||
              locationStatus === "blocked" ||
              locationStatus === "unavailable") && (
              <p role="status" className="text-[11px] text-text-secondary text-center">
                Location unavailable — drag the pin manually, or enable location in your
                browser settings and tap Locate Me.
              </p>
            )}
          </div>

          {/* Label Type Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-text-secondary uppercase tracking-wider">
              Save As
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  void HapticService.selection();
                  setLabel("home");
                }}
                className={cn(
                  "py-2.5 px-3 min-h-[44px] rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition-all cursor-pointer",
                  label === "home"
                    ? "border-[#0E4825] bg-[#0E4825] text-white shadow-xs"
                    : "border-divider bg-bg-secondary text-text hover:border-primary/40"
                )}
              >
                <Home className="w-4 h-4" />
                <span>Home</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  void HapticService.selection();
                  setLabel("work");
                }}
                className={cn(
                  "py-2.5 px-3 min-h-[44px] rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition-all cursor-pointer",
                  label === "work"
                    ? "border-[#0E4825] bg-[#0E4825] text-white shadow-xs"
                    : "border-divider bg-bg-secondary text-text hover:border-primary/40"
                )}
              >
                <Briefcase className="w-4 h-4" />
                <span>Work</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  void HapticService.selection();
                  setLabel("other");
                }}
                className={cn(
                  "py-2.5 px-3 min-h-[44px] rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition-all cursor-pointer",
                  label === "other"
                    ? "border-[#0E4825] bg-[#0E4825] text-white shadow-xs"
                    : "border-divider bg-bg-secondary text-text hover:border-primary/40"
                )}
              >
                <MapPin className="w-4 h-4" />
                <span>Other</span>
              </button>
            </div>
          </div>

          {/* Custom Label if Other */}
          {label === "other" && (
            <div className="space-y-1">
              <label className="text-xs font-bold text-text-secondary">
                Nickname / Tag
              </label>
              <input
                type="text"
                placeholder="e.g. Friends House, Gym"
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl bg-bg-secondary border border-divider text-xs font-medium text-text outline-none focus:border-primary"
              />
            </div>
          )}

          {/* Flat / Building */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-text-secondary">
              Flat / House / Building *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Flat 402, Sunshine Heights"
              value={line1}
              onChange={(e) => setLine1(e.target.value)}
              className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl bg-bg-secondary border border-divider text-xs font-medium text-text outline-none focus:border-primary"
            />
          </div>

          {/* Area / Street */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-text-secondary">
              Area / Street
            </label>
            <input
              type="text"
              placeholder="e.g. Linking Road, Bandra West"
              value={line2}
              onChange={(e) => setLine2(e.target.value)}
              className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl bg-bg-secondary border border-divider text-xs font-medium text-text outline-none focus:border-primary"
            />
          </div>

          {/* Landmark & Pincode Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-text-secondary">
                Landmark
              </label>
              <input
                type="text"
                placeholder="e.g. Near Metro Station"
                value={landmark}
                onChange={(e) => setLandmark(e.target.value)}
                className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl bg-bg-secondary border border-divider text-xs font-medium text-text outline-none focus:border-primary"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-text-secondary">
                Pincode *
              </label>
              <input
                type="text"
                required
                maxLength={6}
                placeholder="e.g. 400050"
                value={pincode}
                onChange={(e) => setPincode(e.target.value.replace(/\D/g, ""))}
                className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl bg-bg-secondary border border-divider text-xs font-mono font-bold text-text outline-none focus:border-primary"
              />
            </div>
          </div>

          {/* City */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-text-secondary">
              City
            </label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl bg-bg-secondary border border-divider text-xs font-medium text-text outline-none focus:border-primary"
            />
          </div>

          {/* Default Toggle */}
          <label className="flex items-center gap-3 pt-2 min-h-[44px] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="w-4 h-4 accent-[#0E4825] rounded-sm cursor-pointer"
            />
            <span className="text-xs font-bold text-text">
              Set as default delivery address
            </span>
          </label>

          {/* Action Button */}
          <div className="pt-3">
            <button
              type="submit"
              disabled={submitting}
              className="w-full min-h-[44px] py-3 px-4 rounded-xl bg-[#FF6600] hover:bg-[#e05a00] text-white text-xs sm:text-sm font-bold shadow-md transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50"
            >
              {submitting ? "Saving..." : addressToEdit ? "Update Address" : "Save Address"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AddressFormModal;
