import { useEffect, useState } from "react";

// Avoid hydration mismatches when reading persisted state or `window`.
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}
