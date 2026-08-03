import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { ulid } from 'ulid';

@Injectable()
export class TokenService {
  ulid(): string {
    return ulid();
  }

  opaqueToken(byteLength = 48): string {
    return randomBytes(byteLength).toString('base64url');
  }
}
