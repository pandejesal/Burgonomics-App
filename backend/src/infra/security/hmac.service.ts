import { Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';

@Injectable()
export class HmacService {
  sign(secret: string, payload: string | Buffer, algo: 'sha256' | 'sha512' = 'sha256'): string {
    return createHmac(algo, secret).update(payload).digest('hex');
  }

  verify(
    secret: string,
    payload: string | Buffer,
    provided: string,
    algo: 'sha256' | 'sha512' = 'sha256',
  ): boolean {
    const expected = Buffer.from(this.sign(secret, payload, algo), 'hex');
    const given = safeHexBuffer(provided);
    if (!given || given.length !== expected.length) return false;
    return timingSafeEqual(expected, given);
  }
}

function safeHexBuffer(hex: string): Buffer | null {
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) return null;
  return Buffer.from(hex, 'hex');
}
