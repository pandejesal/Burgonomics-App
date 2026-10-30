/**
 * Pure bucket arithmetic for the menu store.
 *
 * The store owns scheduling and epoch bookkeeping; every array merge lives here
 * so it can be reasoned about (and tested) without Zustand or Firestore.
 */
import type { Product, ProductPage } from "../models";

export interface MenuCategoryBucket {
  items: Product[];
  /** Last page that was successfully merged (0 = nothing loaded yet). */
  page: number;
  pageSize: number;
  /** Real total for this category, as reported by the scoped catalog read. */
  total: number;
  hasMore: boolean;
  loading: boolean;
  error?: string;
}

export function emptyBucket(pageSize: number): MenuCategoryBucket {
  return {
    items: [],
    page: 0,
    pageSize,
    total: 0,
    hasMore: true,
    loading: false,
  };
}

function appendUnique(existing: Product[], incoming: Product[]): Product[] {
  const seen = new Set(existing.map((item) => item.id));
  const merged = [...existing];
  for (const item of incoming) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    merged.push(item);
  }
  return merged;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

/**
 * Validate a repository page before it reaches the bucket arithmetic.
 *
 * A successful envelope around a malformed payload used to throw inside the
 * merge, leaving the section stuck on `loading` with an unhandled rejection.
 * Returns `null` for anything the UI cannot render honestly, including a page
 * that carries more rows than its own `pageSize` (a guard against painting a
 * whole catalog in one shot).
 */
export function parseProductPage(value: unknown): ProductPage | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<ProductPage>;
  if (!Array.isArray(candidate.items)) return null;
  if (!isPositiveInteger(candidate.page) || !isPositiveInteger(candidate.pageSize)) return null;
  if (typeof candidate.total !== "number" || !Number.isFinite(candidate.total) || candidate.total < 0) {
    return null;
  }
  if (candidate.items.length > candidate.pageSize) return null;

  const seen = new Set<string>();
  for (const item of candidate.items) {
    if (!item || typeof item !== "object") return null;
    const row = item as Partial<Product>;
    if (typeof row.id !== "string" || row.id.length === 0) return null;
    if (typeof row.categoryId !== "string" || row.categoryId.length === 0) return null;
    if (typeof row.name !== "string") return null;
    if (typeof row.price !== "number" || !Number.isFinite(row.price)) return null;
    if (seen.has(row.id)) return null;
    seen.add(row.id);
  }

  return {
    items: candidate.items as Product[],
    page: candidate.page,
    pageSize: candidate.pageSize,
    total: candidate.total,
  };
}

/**
 * Merge one real page. Page 1 replaces the bucket (a refresh must not double
 * the list), later pages append by id.
 *
 * `hasMore` is driven by the server's total, never by how many cards happen to
 * be loaded, and an empty page terminates pagination even when the total says
 * otherwise — otherwise a cursor-less read would spin forever.
 */
export function mergeCategoryPage(
  bucket: MenuCategoryBucket,
  page: ProductPage,
  requestedPage: number,
): MenuCategoryBucket {
  const items =
    requestedPage <= 1 ? page.items.slice() : appendUnique(bucket.items, page.items);
  return {
    items,
    page: requestedPage,
    pageSize: page.pageSize,
    total: Math.max(page.total, page.page === 1 ? 0 : bucket.total),
    hasMore: page.items.length > 0 && items.length < page.total,
    loading: false,
    error: undefined,
  };
}

export interface LiveSnapshotOptions {
  /**
   * True ONLY when the payload is the whole store-scoped query (no page
   * window/limit). Absence may then be reconciled inside already-rendered
   * buckets; partial payloads never reconcile membership.
   */
  complete?: boolean;
  /** Page size used when an emptied bucket has to restart from page 1. */
  pageSize?: number;
}

const DEFAULT_PAGE_SIZE = 20;

/**
 * Merge a real-time, store-scoped product snapshot into already-loaded buckets.
 *
 * Rules:
 * - Every product still in scope updates in place, so an 86-ing or a price
 *   change reaches cards loaded long before the snapshot (item 41+ included).
 * - `removedIds` are explicit Firestore removals and always win on partial
 *   payloads.
 * - Only a *proven complete* snapshot may reconcile membership. Partial or
 *   unknown payloads keep loaded items, total and `hasMore` untouched — a
 *   limited page must never prune pages it never carried.
 * - A proven-complete payload is the store's whole catalog in the SAME
 *   canonical order the paged reads slice. Each already-loaded bucket is
 *   reconciled to that canonical prefix, sized to the page window the bucket
 *   asked for. This is what makes delete-all → re-add, bulk growth and
 *   category moves correct: the old "append arrivals after computing hasMore"
 *   rule skipped items whenever a snapshot grew by more than one page (the
 *   next page then started past them), and a moved product stayed marked in
 *   its old category so its new one never received it.
 */
export function mergeLiveSnapshot(
  buckets: Record<string, MenuCategoryBucket>,
  products: readonly Product[],
  removedIds: readonly string[],
  options: LiveSnapshotOptions = {},
): Record<string, MenuCategoryBucket> {
  const complete = options.complete === true;
  const fallbackPageSize =
    isPositiveInteger(options.pageSize) ? options.pageSize : DEFAULT_PAGE_SIZE;

  const byId = new Map<string, Product>();
  const byCategory = new Map<string, Product[]>();
  for (const product of products) {
    byId.set(product.id, product);
    const list = byCategory.get(product.categoryId);
    if (list) list.push(product);
    else byCategory.set(product.categoryId, [product]);
  }
  const removed = new Set(removedIds);

  const next: Record<string, MenuCategoryBucket> = {};

  for (const [categoryId, bucket] of Object.entries(buckets)) {
    if (!complete) {
      // Limited payload: update what we saw, keep everything else (and the
      // pagination state) untouched.
      const items: Product[] = [];
      for (const item of bucket.items) {
        const fresh = byId.get(item.id);
        if (fresh) {
          if (fresh.categoryId === categoryId) items.push(fresh);
          continue;
        }
        if (removed.has(item.id)) continue;
        items.push(item);
      }
      next[categoryId] = { ...bucket, items };
      continue;
    }

    const pageSize = isPositiveInteger(bucket.pageSize) ? bucket.pageSize : fallbackPageSize;
    const canonical = byCategory.get(categoryId) ?? [];
    // Page window the bucket has already committed to. `Math.max(1, page)`
    // reseeds an emptied bucket from page 1 (page 0) without inventing pages.
    const window = Math.max(1, bucket.page) * pageSize;
    const items = canonical.slice(0, window);
    // Keep `page` coherent after a shrink: a bucket that had 3 pages but now
    // holds 1.5 pages must not keep paging from page 3.
    const page = items.length === 0 ? 0 : Math.max(1, Math.ceil(items.length / pageSize));

    next[categoryId] = {
      ...bucket,
      items,
      page,
      total: canonical.length,
      hasMore: items.length < canonical.length,
      error: undefined,
    };
  }

  return next;
}
