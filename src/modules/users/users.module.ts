import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CloudinaryService } from '@/common/services';
import { User } from '@/entities/user.entity';
import { AuthModule } from '@/modules/auth/auth.module';
import { OrdersModule } from '@/modules/orders/orders.module';
import { USERS_REPOSITORY } from '@/modules/users/domain/ports';
import { UsersRepository } from '@/modules/users/infrastructure/persistence';
import { WalletsModule } from '@/modules/wallets/wallets.module';
import { ContactEmailVerificationService } from './contact-email-verification.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    forwardRef(() => AuthModule),
    forwardRef(() => OrdersModule),
    WalletsModule,
  ],
  providers: [
    UsersService,
    UsersRepository,
    {
      provide: USERS_REPOSITORY,
      useExisting: UsersRepository,
    },
    CloudinaryService,
    ContactEmailVerificationService,
  ],
  controllers: [UsersController],
  exports: [UsersService, UsersRepository, USERS_REPOSITORY],
})
export class UsersModule {}
