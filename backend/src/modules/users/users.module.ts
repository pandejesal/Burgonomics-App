import { Module } from '@nestjs/common';
import { UsersController } from './controllers/users.controller';
import { UsersService } from './services/users.service';
import { UserPrismaRepository } from './repositories/prisma/user.prisma-repository';
import { USER_REPOSITORY } from './repositories/interfaces/user-repository.interface';

@Module({
  controllers: [UsersController],
  providers: [
    UsersService,
    UserPrismaRepository,
    { provide: USER_REPOSITORY, useExisting: UserPrismaRepository },
  ],
  exports: [UsersService, USER_REPOSITORY],
})
export class UsersModule {}
