import { useMemo, useCallback } from 'react';
import { useStoreSelection } from '../state/storeStore';
import { useLocationPermission } from './useLocationPermission';
import { haversineKm } from '../utils/distance';
import { isStoreInDeliveryArea } from '../utils/serviceArea';
import type { Store } from '../models/Store';
import { useCartStore, selectHasItems } from '@/features/cart';
import { useAddressStore, selectSelectedAddress } from '@/features/addresses/state/addressStore';

export interface NearestStoreResult {
  store: Store;
  distanceKm: number;
  isOpen: boolean;
  closingStatusText: string;
}

/**
 * Checks if a store is currently open given its opening and closing hours string (e.g. "11:00" to "23:30" or "02:00").
 */
export function isStoreOpenAtTime(
  hours: { open: string; close: string },
  currentDate: Date = new Date()
): { isOpen: boolean; statusText: string } {
  if (!hours?.open || !hours?.close) {
    return { isOpen: true, statusText: 'Open Now' };
  }

  const parseTimeToMinutes = (timeStr: string): number => {
    // Supports "11:00", "11:00 AM", "23:30", "11:30 PM"
    const cleaned = timeStr.trim().toUpperCase();
    const isPM = cleaned.includes('PM');
    const isAM = cleaned.includes('AM');
    const timePart = cleaned.replace(/[^0-9:]/g, '');
    const [hStr, mStr] = timePart.split(':');
    let h = parseInt(hStr, 10) || 0;
    const m = parseInt(mStr, 10) || 0;

    if (isPM && h < 12) h += 12;
    if (isAM && h === 12) h = 0;

    return h * 60 + m;
  };

  const openMinutes = parseTimeToMinutes(hours.open);
  const closeMinutes = parseTimeToMinutes(hours.close);
  const currentMinutes = currentDate.getHours() * 60 + currentDate.getMinutes();

  let isOpen = false;

  if (closeMinutes > openMinutes) {
    // Normal same-day schedule (e.g. 11:00 to 23:30)
    isOpen = currentMinutes >= openMinutes && currentMinutes < closeMinutes;
  } else {
    // Overnight schedule (e.g. 11:00 to 02:00 next day)
    isOpen = currentMinutes >= openMinutes || currentMinutes < closeMinutes;
  }

  if (isOpen) {
    const minutesUntilClose =
      closeMinutes > currentMinutes
        ? closeMinutes - currentMinutes
        : closeMinutes + 1440 - currentMinutes;

    if (minutesUntilClose <= 45) {
      return { isOpen: true, statusText: `Closes in ${minutesUntilClose} mins` };
    }
    return { isOpen: true, statusText: `Open until ${hours.close}` };
  } else {
    return { isOpen: false, statusText: `Closed • Opens at ${hours.open}` };
  }
}

export function useNearestStore() {
  const {
    stores,
    activeStore,
    setActiveStore,
    coords,
    fulfillment,
  } = useStoreSelection();

  const permission = useLocationPermission();
  const selectedAddress = useAddressStore(selectSelectedAddress);

  // User position precedence: (a) selected delivery address with lat/lng,
  // (b) device/cached GPS, (c) null -> nothing gets ranked or blocked.
  const activeCoords = useMemo(() => {
    if (typeof selectedAddress?.lat === 'number' && typeof selectedAddress?.lng === 'number') {
      return { lat: selectedAddress.lat, lng: selectedAddress.lng };
    }
    return coords ?? permission.coords ?? null;
  }, [selectedAddress, coords, permission.coords]);

  const hasCartItems = useCartStore(selectHasItems);
  const cartStoreId = useCartStore((s) => s.storeId);
  const clearCart = useCartStore((s) => s.clear);

  const rankedStores: NearestStoreResult[] = useMemo(() => {
    if (!stores || stores.length === 0) return [];

    let filteredStores = stores;

    // Filter out-of-area stores when fulfillment is delivery and we have coords
    if (fulfillment === "delivery" && activeCoords) {
      filteredStores = stores.filter((store) => isStoreInDeliveryArea(store, activeCoords.lat, activeCoords.lng));
    }

    return filteredStores.map((store: Store) => {
      let distanceKm = 0;
      if (activeCoords && store.lat && store.lng) {
        distanceKm = parseFloat(
          haversineKm(
            { lat: activeCoords.lat, lng: activeCoords.lng },
            { lat: store.lat, lng: store.lng }
          ).toFixed(1)
        );
      }

      // P1-3: hours is null when the store doc carries no schedule — never
      // invent one. Fall back to the doc's own `isOpen` field instead.
      const { isOpen, statusText } = store.hours
        ? isStoreOpenAtTime(store.hours)
        : {
            isOpen: store.isOpen,
            statusText: store.isOpen ? "Open Now" : "Closed",
          };

      return {
        store: {
          ...store,
          distanceKm: distanceKm > 0 ? distanceKm : undefined,
          isOpen,
        },
        distanceKm,
        isOpen,
        closingStatusText: statusText,
      };
    }).sort((a: NearestStoreResult, b: NearestStoreResult) => {
      if (activeCoords) {
        return a.distanceKm - b.distanceKm;
      }
      return a.store.name.localeCompare(b.store.name);
    });
  }, [stores, activeCoords, fulfillment]);

  // Never hand back an out-of-area store while DELIVERY is active: an empty
  // (all-filtered) ranking must resolve to null rather than a far-away kitchen.
  const activeStoreAllowed =
    !activeStore ||
    fulfillment !== 'delivery' ||
    !activeCoords ||
    isStoreInDeliveryArea(activeStore, activeCoords.lat, activeCoords.lng);

  const nearestStore = rankedStores[0]?.store ?? (activeStoreAllowed ? activeStore : null);

  const switchStoreSafely = useCallback(
    async (
      targetStore: Store,
      onConfirmRequired?: (mismatchWarning: string) => Promise<boolean>
    ) => {
      const needsCartClear = hasCartItems && cartStoreId && cartStoreId !== targetStore.id;
      if (needsCartClear) {
        const warningMessage = `Changing your active kitchen to ${targetStore.name} will reset items in your cart from your previous store. Do you wish to proceed?`;
        if (onConfirmRequired) {
          const confirmed = await onConfirmRequired(warningMessage);
          if (!confirmed) return false;
        }
      }

      // Switch FIRST: setActiveStore rejects out-of-area stores in delivery
      // mode (it toasts the reason), and a rejected switch must never cost
      // the user their cart. clear() is a plain state reset, so swapping the
      // order leaves the end state identical on success.
      setActiveStore(targetStore);
      const applied = useStoreSelection.getState().activeStore?.id === targetStore.id;
      if (!applied) return false;

      if (needsCartClear) clearCart();
      return true;
    },
    [hasCartItems, cartStoreId, clearCart, setActiveStore]
  );

  return {
    rankedStores,
    nearestStore,
    activeStore,
    userCoords: activeCoords,
    hasLocation: !!activeCoords,
    requestLocation: permission.request,
    permissionStatus: permission.status,
    switchStoreSafely,
  };
}
