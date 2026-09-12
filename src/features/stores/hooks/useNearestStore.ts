import { useMemo, useCallback } from 'react';
import { useStoreSelection } from '../state/storeStore';
import { useLocationPermission } from './useLocationPermission';
import { haversineKm } from '../utils/distance';
import type { Store } from '../models/Store';
import { useCartStore, selectHasItems } from '@/features/cart';

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
    status,
    coords,
  } = useStoreSelection();

  const permission = useLocationPermission();
  const activeCoords = coords || permission.coords;

  const hasCartItems = useCartStore(selectHasItems);
  const cartStoreId = useCartStore((s) => s.storeId);
  const clearCart = useCartStore((s) => s.clear);

  const rankedStores: NearestStoreResult[] = useMemo(() => {
    if (!stores || stores.length === 0) return [];

    return stores.map((store: Store) => {
      let distanceKm = 0;
      if (activeCoords && store.lat && store.lng) {
        distanceKm = parseFloat(
          haversineKm(
            { lat: activeCoords.lat, lng: activeCoords.lng },
            { lat: store.lat, lng: store.lng }
          ).toFixed(1)
        );
      }

      const { isOpen, statusText } = isStoreOpenAtTime(store.hours);

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
  }, [stores, activeCoords]);

  const nearestStore = rankedStores[0]?.store || activeStore || null;

  const switchStoreSafely = useCallback(
    async (
      targetStore: Store,
      onConfirmRequired?: (mismatchWarning: string) => Promise<boolean>
    ) => {
      if (hasCartItems && cartStoreId && cartStoreId !== targetStore.id) {
        const warningMessage = `Changing your active kitchen to ${targetStore.name} will reset items in your cart from your previous store. Do you wish to proceed?`;
        if (onConfirmRequired) {
          const confirmed = await onConfirmRequired(warningMessage);
          if (!confirmed) return false;
        }
        clearCart();
      }

      setActiveStore(targetStore);
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
