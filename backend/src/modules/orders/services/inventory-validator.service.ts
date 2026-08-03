import { Injectable } from '@nestjs/common';
import { ValidationError } from '@common/errors';
import { ProductsService } from '@modules/products/services/products.service';
import { StoresService } from '@modules/stores/services/stores.service';
import type { CartEntity } from '@modules/cart/entities/cart.entity';

/**
 * Server-side inventory & availability validation performed immediately
 * before order creation. Placeholders here integrate with future
 * PETPOOJA synchronization surface — no PETPOOJA HTTP calls are made
 * from this module (per architecture).
 */
@Injectable()
export class InventoryValidatorService {
  constructor(
    private readonly products: ProductsService,
    private readonly stores: StoresService,
  ) {}

  async assertCartIsFulfillable(cart: CartEntity): Promise<void> {
    if (!cart.storeId) throw new ValidationError('Store is required');
    const store = await this.stores.get(cart.storeId);
    if (!store) throw new ValidationError('Store not found');

    for (const item of cart.items) {
      const avail = await this.products.availability(item.productId, cart.storeId);
      if (!avail || !avail.isAvailable || !avail.inStock) {
        throw new ValidationError(`Product ${item.name} is not available at this store`);
      }
    }
    // Modifier availability + offer validity are validated by their own
    // services during pricing; extended checks slot in here when PETPOOJA
    // exposes richer stock signals.
  }
}
