import { ArgumentMetadata, Injectable, PipeTransform } from '@nestjs/common';
import { ZodSchema } from 'zod';
import { ValidationError } from '@common/errors';

/**
 * Validates a request payload against a Zod schema. Use with:
 *   @UsePipes(new ZodValidationPipe(mySchema))
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown, _metadata: ArgumentMetadata): T {
    const parsed = this.schema.safeParse(value);
    if (!parsed.success) {
      throw new ValidationError('Invalid request payload', {
        issues: parsed.error.issues,
      });
    }
    return parsed.data;
  }
}
