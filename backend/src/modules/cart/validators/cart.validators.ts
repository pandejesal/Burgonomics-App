import { z } from 'zod';

export const AddItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().min(1).max(50),
  modifiers: z
    .array(
      z.object({
        groupId: z.string().min(1),
        optionId: z.string().min(1),
      }),
    )
    .default([]),
  notes: z.string().max(240).optional(),
});
export type AddItemInput = z.infer<typeof AddItemSchema>;

export const UpdateItemSchema = z.object({
  quantity: z.number().int().min(0).max(50).optional(),
  modifiers: z
    .array(
      z.object({
        groupId: z.string().min(1),
        optionId: z.string().min(1),
      }),
    )
    .optional(),
  notes: z.string().max(240).optional(),
});
export type UpdateItemInput = z.infer<typeof UpdateItemSchema>;
