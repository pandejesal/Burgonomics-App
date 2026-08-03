export class AddressEntity {
  id!: string;
  userId!: string;
  label!: string;
  line1!: string;
  line2?: string | null;
  landmark?: string | null;
  city!: string;
  state!: string;
  pincode!: string;
  country!: string;
  latitude?: number | null;
  longitude?: number | null;
  isDefault!: boolean;
  createdAt!: Date;
  updatedAt!: Date;
}
