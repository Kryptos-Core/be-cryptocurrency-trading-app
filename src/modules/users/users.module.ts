import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { ContactEmailVerificationService } from './contact-email-verification.service';
import { UsersController } from './users.controller';
import { UsersRepository } from './repositories';
import { User } from '@/entities/user.entity';
import { OnchainTransaction } from '@/entities/onchain-transaction.entity';
import { CloudinaryService } from '@/common/services';
import { AuthModule } from '@/modules/auth/auth.module';
import { WalletsModule } from '@/modules/wallets/wallets.module';
import { OrderRepository } from '@/modules/orders/repositories';
import { Order } from '@/entities/order.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, OnchainTransaction, Order]),
    AuthModule,
    WalletsModule,
  ],
  providers: [
    UsersService,
    UsersRepository,
    CloudinaryService,
    OrderRepository,
    ContactEmailVerificationService,
  ],
  controllers: [UsersController],
  exports: [UsersService, UsersRepository],
})
export class UsersModule {}
