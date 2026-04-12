import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CloudinaryService } from '@/common/services';
import { OnchainTransaction } from '@/entities/onchain-transaction.entity';
import { Order } from '@/entities/order.entity';
import { User } from '@/entities/user.entity';
import { AuthModule } from '@/modules/auth/auth.module';
import { OrderRepository } from '@/modules/orders/repositories';
import { WalletsModule } from '@/modules/wallets/wallets.module';
import { ContactEmailVerificationService } from './contact-email-verification.service';
import { UsersRepository } from './repositories';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, OnchainTransaction, Order]), AuthModule, WalletsModule],
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
