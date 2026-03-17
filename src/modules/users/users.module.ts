import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { UsersRepository } from './repositories';
import { User } from '@/entities/user.entity';
import { CloudinaryService } from '@/common/services';
import { AuthModule } from '@/modules/auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([User]), AuthModule],
  providers: [UsersService, UsersRepository, CloudinaryService],
  controllers: [UsersController],
  exports: [UsersService, UsersRepository],
})
export class UsersModule {}
