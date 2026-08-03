import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@infra/prisma/prisma.service';
import { NotFoundError } from '@common/errors';
import { CartMapper } from '../../mappers/cart.mapper';
import type { CartEntity } from '../../entities/cart.entity';
import type {
  AddItemArgs,
  CreateCartArgs,
  ICartRepository,
  UpdateCartMetaArgs,
  UpdateItemArgs,
} from '../interfaces/cart-repository.interface';

const INCLUDE = {
  items: {
    orderBy: { createdAt: 'asc' as const },
    include: { modifiers: true },
  },
} satisfies Prisma.CartInclude;

@Injectable()
export class CartPrismaRepository implements ICartRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(args: CreateCartArgs): Promise<CartEntity> {
    const row = await this.prisma.cart.create({
      data: {
        userId: args.userId ?? null,
        anonymousId: args.anonymousId ?? null,
        storeId: args.storeId ?? null,
        fulfillment: args.fulfillment,
        currency: args.currency ?? 'INR',
        expiresAt: args.expiresAt ?? null,
      },
      include: INCLUDE,
    });
    return CartMapper.toEntity(row);
  }

  async findById(id: string): Promise<CartEntity | null> {
    const row = await this.prisma.cart.findUnique({ where: { id }, include: INCLUDE });
    return row ? CartMapper.toEntity(row) : null;
  }

  async findActiveByUser(userId: string): Promise<CartEntity | null> {
    const row = await this.prisma.cart.findFirst({
      where: { userId, status: 'ACTIVE' },
      orderBy: { updatedAt: 'desc' },
      include: INCLUDE,
    });
    return row ? CartMapper.toEntity(row) : null;
  }

  async findActiveByAnonymous(anonymousId: string): Promise<CartEntity | null> {
    const row = await this.prisma.cart.findFirst({
      where: { anonymousId, status: 'ACTIVE' },
      orderBy: { updatedAt: 'desc' },
      include: INCLUDE,
    });
    return row ? CartMapper.toEntity(row) : null;
  }

  async updateMeta(cartId: string, args: UpdateCartMetaArgs): Promise<CartEntity> {
    const row = await this.prisma.cart.update({
      where: { id: cartId },
      data: {
        storeId: args.storeId ?? undefined,
        fulfillment: args.fulfillment ?? undefined,
        addressId: args.addressId ?? undefined,
        tableNumber: args.tableNumber ?? undefined,
        notes: args.notes ?? undefined,
      },
      include: INCLUDE,
    });
    return CartMapper.toEntity(row);
  }

  async addItem(cartId: string, args: AddItemArgs): Promise<CartEntity> {
    await this.prisma.$transaction(async (tx) => {
      const created = await tx.cartItem.create({
        data: {
          cartId,
          productId: args.productId,
          productPetpoojaId: args.productPetpoojaId,
          name: args.name,
          quantity: args.quantity,
          unitPrice: new Prisma.Decimal(args.unitPrice),
          taxRate: new Prisma.Decimal(args.taxRate),
          notes: args.notes ?? null,
        },
      });
      if (args.modifiers.length) {
        await tx.cartItemModifier.createMany({
          data: args.modifiers.map((m) => ({
            cartItemId: created.id,
            groupId: m.groupId,
            groupName: m.groupName,
            optionId: m.optionId,
            optionPetpoojaId: m.optionPetpoojaId,
            optionName: m.optionName,
            priceDelta: new Prisma.Decimal(m.priceDelta),
          })),
        });
      }
      await tx.cart.update({ where: { id: cartId }, data: { updatedAt: new Date() } });
    });
    return this.mustFind(cartId);
  }

  async updateItem(cartId: string, itemId: string, args: UpdateItemArgs): Promise<CartEntity> {
    await this.prisma.$transaction(async (tx) => {
      if (args.quantity === 0) {
        await tx.cartItem.delete({ where: { id: itemId } });
      } else {
        await tx.cartItem.update({
          where: { id: itemId },
          data: {
            quantity: args.quantity ?? undefined,
            notes: args.notes ?? undefined,
          },
        });
        if (args.modifiers) {
          await tx.cartItemModifier.deleteMany({ where: { cartItemId: itemId } });
          if (args.modifiers.length) {
            await tx.cartItemModifier.createMany({
              data: args.modifiers.map((m) => ({
                cartItemId: itemId,
                groupId: m.groupId,
                groupName: m.groupName,
                optionId: m.optionId,
                optionPetpoojaId: m.optionPetpoojaId,
                optionName: m.optionName,
                priceDelta: new Prisma.Decimal(m.priceDelta),
              })),
            });
          }
        }
      }
      await tx.cart.update({ where: { id: cartId }, data: { updatedAt: new Date() } });
    });
    return this.mustFind(cartId);
  }

  async removeItem(cartId: string, itemId: string): Promise<CartEntity> {
    await this.prisma.cartItem.delete({ where: { id: itemId } });
    return this.mustFind(cartId);
  }

  async clear(cartId: string): Promise<CartEntity> {
    await this.prisma.cartItem.deleteMany({ where: { cartId } });
    return this.mustFind(cartId);
  }

  async markStatus(cartId: string, status: 'CONVERTED' | 'ABANDONED' | 'EXPIRED'): Promise<void> {
    await this.prisma.cart.update({ where: { id: cartId }, data: { status } });
  }

  async mergeAnonymousInto(anonymousId: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const anon = await tx.cart.findFirst({
        where: { anonymousId, status: 'ACTIVE' },
        include: INCLUDE,
      });
      if (!anon) return null;

      let target = await tx.cart.findFirst({
        where: { userId, status: 'ACTIVE' },
        include: INCLUDE,
      });
      if (!target) {
        target = await tx.cart.update({
          where: { id: anon.id },
          data: { userId, anonymousId: null },
          include: INCLUDE,
        });
        return { target: CartMapper.toEntity(target), itemsMerged: anon.items.length };
      }

      let moved = 0;
      for (const item of anon.items) {
        const created = await tx.cartItem.create({
          data: {
            cartId: target.id,
            productId: item.productId,
            productPetpoojaId: item.productPetpoojaId,
            name: item.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            taxRate: item.taxRate,
            notes: item.notes,
          },
        });
        if (item.modifiers.length) {
          await tx.cartItemModifier.createMany({
            data: item.modifiers.map((m) => ({
              cartItemId: created.id,
              groupId: m.groupId,
              groupName: m.groupName,
              optionId: m.optionId,
              optionPetpoojaId: m.optionPetpoojaId,
              optionName: m.optionName,
              priceDelta: m.priceDelta,
            })),
          });
        }
        moved++;
      }
      await tx.cart.update({ where: { id: anon.id }, data: { status: 'ABANDONED' } });
      const refreshed = await tx.cart.findUnique({ where: { id: target.id }, include: INCLUDE });
      return { target: CartMapper.toEntity(refreshed!), itemsMerged: moved };
    });
  }

  async expireStaleCarts(now: Date): Promise<number> {
    const res = await this.prisma.cart.updateMany({
      where: { status: 'ACTIVE', expiresAt: { lt: now } },
      data: { status: 'EXPIRED' },
    });
    return res.count;
  }

  private async mustFind(cartId: string): Promise<CartEntity> {
    const row = await this.prisma.cart.findUnique({ where: { id: cartId }, include: INCLUDE });
    if (!row) throw new NotFoundError('Cart not found');
    return CartMapper.toEntity(row);
  }
}
