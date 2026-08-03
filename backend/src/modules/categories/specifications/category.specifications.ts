import type { Prisma } from '@prisma/client';

/** Query specifications for the Category aggregate. Keeps Prisma-typed
 * WHERE clauses out of controllers and repositories. */
export class CategorySpecifications {
  static byId(id: string): Prisma.CategoryWhereUniqueInput {
    return { id };
  }
  static visible(): Prisma.CategoryWhereInput {
    return { isVisible: true, isAvailable: true };
  }
  static roots(): Prisma.CategoryWhereInput {
    return { parentId: null };
  }
  static childrenOf(parentId: string): Prisma.CategoryWhereInput {
    return { parentId };
  }
  static search(query: string): Prisma.CategoryWhereInput {
    return { name: { contains: query, mode: 'insensitive' } };
  }
}
