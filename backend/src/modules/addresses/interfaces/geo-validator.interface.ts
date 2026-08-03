/**
 * Placeholder geo-validation port. Real implementations may call
 * Google Places or Mapbox to normalize the address, verify service
 * radius, and enrich lat/long. Wired in a later phase.
 */
export interface GeoValidator {
  readonly name: string;
  validate(input: {
    line1: string;
    city: string;
    state: string;
    pincode: string;
    country: string;
    latitude?: number | null;
    longitude?: number | null;
  }): Promise<{ ok: boolean; latitude?: number; longitude?: number; reason?: string }>;
}
