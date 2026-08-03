import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '@infra/prisma/prisma.service';

export interface AdminJwtPayload {
  sub: string;
  email: string;
  role: string;
  permissions: string[];
}

@Injectable()
export class AdminJwtStrategy extends PassportStrategy(Strategy, 'admin-jwt') {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        process.env.ADMIN_JWT_ACCESS_SECRET || 'burgonomics-admin-access-secret-key-2026!',
    });
  }

  async validate(payload: AdminJwtPayload) {
    const admin = await this.prisma.adminUser.findUnique({
      where: { id: payload.sub },
      include: {
        role: {
          include: {
            permissions: {
              include: {
                permission: true,
              },
            },
          },
        },
      },
    });

    if (!admin || !admin.isActive) {
      throw new UnauthorizedException('Admin user is inactive or does not exist');
    }

    return {
      id: admin.id,
      uuid: admin.uuid,
      email: admin.email,
      fullName: admin.fullName,
      role: admin.role.name,
      isDeveloper: admin.isDeveloper,
      permissions: admin.role.permissions.map((p) => p.permission.key),
    };
  }
}
