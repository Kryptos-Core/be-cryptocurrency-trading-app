import { Inject, Injectable } from '@nestjs/common';
import type { DevUserPickDto } from '@/modules/auth/dto/dev-user-pick.dto';
import { USERS_REPOSITORY, type UsersRepositoryPort } from '@/modules/users/domain/ports';

@Injectable()
export class ListSandboxUsersUseCase {
  constructor(
    @Inject(USERS_REPOSITORY)
    private readonly usersRepository: UsersRepositoryPort,
  ) {}

  async execute(): Promise<DevUserPickDto[]> {
    const records = await this.usersRepository.findActiveForSandbox();
    return records.map((u) => ({
      userId: u.user_id,
      email: u.email,
      firstName: u.first_name,
      lastName: u.last_name,
      role: u.role,
      status: u.status,
      avatarUrl: u.avatar_url,
      createdAt: u.created_at,
    }));
  }
}
