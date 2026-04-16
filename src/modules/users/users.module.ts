import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CloudinaryService } from '@/common/services';
import { User } from '@/entities/user.entity';
import { AuthModule } from '@/modules/auth/auth.module';
import { OrdersModule } from '@/modules/orders/orders.module';
import { USERS_REPOSITORY } from '@/modules/users/domain/ports';
import { UsersRepository } from '@/modules/users/infrastructure/persistence';
import { WalletsModule } from '@/modules/wallets/wallets.module';
import { GetUsersQuery } from './application/queries/get-users.query';
import { DeleteUserUseCase } from './application/use-cases/delete-user.use-case';
import { RequestSecurityChangeUseCase } from './application/use-cases/request-security-change.use-case';
import { ReviewSecurityChangeUseCase } from './application/use-cases/review-security-change.use-case';
import { SaveFcmTokenUseCase } from './application/use-cases/save-fcm-token.use-case';
import { UpdateProfileBasicUseCase } from './application/use-cases/update-profile-basic.use-case';
import { UpdateUserUseCase } from './application/use-cases/update-user.use-case';
import { UploadAvatarUseCase } from './application/use-cases/upload-avatar.use-case';
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
    GetUsersQuery,
    UpdateUserUseCase,
    DeleteUserUseCase,
    UpdateProfileBasicUseCase,
    RequestSecurityChangeUseCase,
    ReviewSecurityChangeUseCase,
    UploadAvatarUseCase,
    SaveFcmTokenUseCase,
  ],
  controllers: [UsersController],
  exports: [UsersService, UsersRepository, USERS_REPOSITORY],
})
export class UsersModule {}
