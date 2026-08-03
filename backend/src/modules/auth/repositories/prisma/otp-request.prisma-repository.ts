import { Injectable } from '@nestjs/common';
import { PrismaService } from '@infra/prisma/prisma.service';
import type { OtpRequestEntity } from '../../entities/auth.entity';
import type {
  CreateOtpInput,
  IOtpRequestRepository,
} from '../interfaces/auth-repository.interface';
import type { OtpPurposeValue } from '../../entities/auth.entity';

@Injectable()
export class OtpRequestPrismaRepository implements IOtpRequestRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateOtpInput): Promise<OtpRequestEntity> {
    const row = await this.prisma.otpRequest.create({
      data: {
        phone: input.phone,
        codeHash: input.codeHash,
        purpose: input.purpose,
        expiresAt: input.expiresAt,
      },
    });
    return { ...row, purpose: row.purpose as OtpPurposeValue };
  }

  async findLatestActive(
    phone: string,
    purpose: OtpPurposeValue,
  ): Promise<OtpRequestEntity | null> {
    const row = await this.prisma.otpRequest.findFirst({
      where: { phone, purpose, verifiedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    return row ? { ...row, purpose: row.purpose as OtpPurposeValue } : null;
  }

  async incrementAttempts(id: string): Promise<void> {
    await this.prisma.otpRequest.update({ where: { id }, data: { attempts: { increment: 1 } } });
  }

  async markVerified(id: string, at: Date): Promise<void> {
    await this.prisma.otpRequest.update({ where: { id }, data: { verifiedAt: at } });
  }
}
