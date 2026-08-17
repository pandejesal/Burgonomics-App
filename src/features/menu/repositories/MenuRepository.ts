import {
  menuService,
  type MenuCategory,
  type MenuItem,
} from "@/features/menu/services/menuService";
import type {
  CustomizationGroup,
  Product,
  ProductDetails,
  ProductPage,
  SearchSuggestion,
} from "@/features/menu/models";
import type { ApiResult } from "@/core/network/http";

/**
 * MenuRepository is the ONLY layer feature UI code may consume for
 * menu / product / customization data. Swapping the mock service for
 * the PETPOOJA-backed HTTP client happens here — UI is unaffected.
 */
export class MenuRepository {
  readonly name = "MenuRepository";
  constructor(private readonly service = menuService) {}

  listCategories(storeId?: string): Promise<ApiResult<MenuCategory[]>> {
    return this.service.listCategories(storeId);
  }
  listProducts(
    storeId?: string,
    categoryId?: string,
    page = 1,
    pageSize = 20,
  ): Promise<ApiResult<ProductPage>> {
    return this.service.listProducts(storeId, categoryId, page, pageSize);
  }
  getProduct(id: string, storeId?: string): Promise<ApiResult<ProductDetails | null>> {
    return this.service.getProduct(id, storeId);
  }
  listCustomizations(productId: string): Promise<ApiResult<CustomizationGroup[]>> {
    return this.service.listCustomizations(productId);
  }
  listRelatedProducts(productId: string, storeId?: string): Promise<ApiResult<Product[]>> {
    return this.service.listRelatedProducts(productId, storeId);
  }
  listPopular(storeId?: string): Promise<ApiResult<Product[]>> {
    return this.service.listPopular(storeId);
  }
  listFeatured(storeId?: string): Promise<ApiResult<Product[]>> {
    return this.service.listFeatured(storeId);
  }
  search(storeId: string | undefined, query: string, page = 1, pageSize = 20) {
    return this.service.search(storeId, query, page, pageSize);
  }
  suggest(storeId: string | undefined, query: string): Promise<ApiResult<SearchSuggestion[]>> {
    return this.service.suggest(storeId, query);
  }
  listTrending(storeId?: string): Promise<ApiResult<SearchSuggestion[]>> {
    return this.service.listTrending(storeId);
  }

  // Legacy passthroughs.
  listItems(categoryId?: string): Promise<ApiResult<MenuItem[]>> {
    return this.service.listItems(categoryId);
  }
  getItem(id: string): Promise<ApiResult<MenuItem | null>> {
    return this.service.getItem(id);
  }

  // Real-time synchronization (<5s sync).
  subscribeCategories(
    storeId: string | undefined,
    callback: (result: ApiResult<MenuCategory[]>) => void,
  ): () => void {
    return this.service.subscribeCategories(storeId, callback);
  }

  subscribeProducts(
    storeId: string | undefined,
    categoryId: string | undefined,
    callback: (result: ApiResult<ProductPage>) => void,
    page = 1,
    pageSize = 40,
  ): () => void {
    return this.service.subscribeProducts(storeId, categoryId, callback, page, pageSize);
  }

  subscribeProduct(
    id: string,
    callback: (result: ApiResult<ProductDetails | null>) => void,
  ): () => void {
    return this.service.subscribeProduct(id, callback);
  }
}

export const menuRepository = new MenuRepository();
