/**
 * Marker interface every feature repository must implement. Concrete
 * signatures live per-feature, but every repository must be reachable
 * via a stable DI token and expose lifecycle helpers.
 */
export interface BaseRepository {
  readonly name: string;
}
