import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CloudinaryService } from '@/common/services';
import { OnchainTransaction } from '@/entities/onchain-transaction.entity';
import { Order } from '@/entities/order.entity';
import { User } from '@/entities/user.entity';
import { AuthModule } from '@/modules/auth/auth.module';
import { OrderRepository } from '@/modules/orders/repositories';
import { USERS_REPOSITORY } from '@/modules/users/domain/ports';
import { UsersRepository } from '@/modules/users/infrastructure/persistence';
import { WalletsModule } from '@/modules/wallets/wallets.module';
import { ContactEmailVerificationService } from './contact-email-verification.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, OnchainTransaction, Order]),
    forwardRef(() => AuthModule),
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
    OrderRepository,
    ContactEmailVerificationService,
  ],
  controllers: [UsersController],
  exports: [UsersService, UsersRepository, USERS_REPOSITORY],
})
export class UsersModule {}
