export class CategoryEntity {
  id!: string;
  petpoojaId!: string;
  name!: string;
  description?: string | null;
  imageUrl?: string | null;
  bannerUrl?: string | null;
  displayOrder!: number;
  isVisible!: boolean;
  isAvailable!: boolean;
  availableFrom?: string | null;
  availableTo?: string | null;
  translations?: Record<string, string> | null;
  parentId?: string | null;
  createdAt!: Date;
  updatedAt!: Date;
}
