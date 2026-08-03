export class ModifierOptionEntity {
  id!: string;
  petpoojaId!: string;
  groupId!: string;
  name!: string;
  price!: string;
  displayOrder!: number;
  isAvailable!: boolean;
  isDefault!: boolean;
  translations?: Record<string, string> | null;
}

export class ModifierGroupEntity {
  id!: string;
  petpoojaId!: string;
  name!: string;
  description?: string | null;
  minSelection!: number;
  maxSelection!: number;
  isRequired!: boolean;
  allowMultiple!: boolean;
  displayOrder!: number;
  isAvailable!: boolean;
  translations?: Record<string, string> | null;
}
