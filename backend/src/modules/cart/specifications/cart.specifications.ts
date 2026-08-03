import type { Prisma } from '@prisma/client';

export class CartSpecifications {
  static activeForUser(userId: string): Prisma.CartWhereInput {
    return { userId, status: 'ACTIVE' };
  }
  static activeForAnonymous(anonymousId: string): Prisma.CartWhereInput {
    return { anonymousId, status: 'ACTIVE' };
  }
  static expired(now: Date = new Date()): Prisma.CartWhereInput {
    return { status: 'ACTIVE', expiresAt: { lt: now } };
  }
}
