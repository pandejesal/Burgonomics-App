import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@infra/prisma/prisma.service';
import { OfferMapper } from '../../mappers/offer.mapper';
import type { ListOffersQueryDto } from '../../dto';
import type { OfferUpsertInput } from '../../validators/offer.validators';
import type { IOfferRepository } from '../interfaces/offer-repository.interface';
import type { OfferEntity } from '../../entities/offer.entity';

@Injectable()
export class OfferPrismaRepository implements IOfferRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<OfferEntity | null> {
    const row = await this.prisma.offer.findUnique({ where: { id } });
    return row ? OfferMapper.toEntity(row) : null;
  }

  async findByCode(code: string): Promise<OfferEntity | null> {
    const row = await this.prisma.offer.findUnique({ where: { code } });
    return row ? OfferMapper.toEntity(row) : null;
  }

  async findByPetpoojaId(petpoojaId: string): Promise<OfferEntity | null> {
    const row = await this.prisma.offer.findUnique({ where: { petpoojaId } });
    return row ? OfferMapper.toEntity(row) : null;
  }

  async list(q: ListOffersQueryDto): Promise<OfferEntity[]> {
    const where: Prisma.OfferWhereInput = {};
    if (q.scope) where.scope = q.scope;
    if (q.activeOnly) {
      const now = new Date();
      where.isActive = true;
      where.AND = [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ];
    }
    if (q.storeId) where.OR = [{ storeIds: { has: q.storeId } }, { storeIds: { isEmpty: true } }];
    if (q.categoryId) where.categoryIds = { has: q.categoryId };
    if (q.productId) where.productIds = { has: q.productId };

    const rows = await this.prisma.offer.findMany({
      where,
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'desc' }],
    });
    return rows.map(OfferMapper.toEntity);
  }

  async activeAt(when: Date): Promise<OfferEntity[]> {
    const rows = await this.prisma.offer.findMany({
      where: {
        isActive: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: when } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: when } }] },
        ],
      },
      orderBy: [{ displayOrder: 'asc' }],
    });
    return rows.map(OfferMapper.toEntity);
  }

  async upsertFromPetpooja(input: OfferUpsertInput): Promise<OfferEntity> {
    const data = {
      code: input.code ?? null,
      title: input.title,
      description: input.description ?? null,
      type: input.type,
      scope: input.scope,
      discountKind: input.discountKind,
      discountValue: new Prisma.Decimal(input.discountValue as string | number),
      maxDiscount:
        input.maxDiscount != null ? new Prisma.Decimal(input.maxDiscount as string | number) : null,
      minOrderValue:
        input.minOrderValue != null
          ? new Prisma.Decimal(input.minOrderValue as string | number)
          : null,
      storeIds: input.storeIds,
      categoryIds: input.categoryIds,
      productIds: input.productIds,
      comboProductIds: input.comboProductIds,
      requiresLogin: input.requiresLogin,
      requiresCoupon: input.requiresCoupon,
      usageLimit: input.usageLimit ?? null,
      perUserLimit: input.perUserLimit ?? null,
      startsAt: input.startsAt ?? null,
      endsAt: input.endsAt ?? null,
      bannerUrl: input.bannerUrl ?? null,
      displayOrder: input.displayOrder,
      isActive: input.isActive,
      metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    };
    const row = input.petpoojaId
      ? await this.prisma.offer.upsert({
          where: { petpoojaId: input.petpoojaId },
          create: { petpoojaId: input.petpoojaId, ...data },
          update: data,
        })
      : await this.prisma.offer.create({ data });
    return OfferMapper.toEntity(row);
  }

  async deactivateByPetpoojaIdsNotIn(keep: string[]): Promise<number> {
    const res = await this.prisma.offer.updateMany({
      where: { petpoojaId: { notIn: keep, not: null } },
      data: { isActive: false },
    });
    return res.count;
  }
}
