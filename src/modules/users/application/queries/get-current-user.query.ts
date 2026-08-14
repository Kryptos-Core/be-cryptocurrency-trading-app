import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CacheService } from '@/common/services';
import { runInSpan } from '@/common/telemetry';
import {
  USERS_REPOSITORY,
  type UsersRepositoryPort,
} from '@/modules/users/domain/ports';

/**
 * GetCurrentUserQuery — read-only query for the authenticated user.
 *
 * Cache-Aside Pattern: cached per userId with a 5-minute TTL because profile
 * is read on every navigation transition (Profile tab, Settings drawer, auth
 * banner). Invalidation is triggered on /me writes (PATCH /users/me,
 * /users/me/avatar, /auth/2fa/*) via the cache-invalidation helper.
 */
@Injectable()
export class GetCurrentUserQuery {
  /**
   * Cache-Aside TTL for the current-user payload (seconds).
   * 5 minutes — profile changes are infrequent and writes invalidate explicitly.
   */
  private static readonly CACHE_TTL_SEC = 300;

  constructor(
    @Inject(USERS_REPOSITORY)
    private readonly usersRepository: UsersRepositoryPort,
    private readonly cacheService: CacheService,
  ) {}

  async execute(userId: string) {
    const cacheKey = `users:user:${userId}`;

    return this.cacheService.getOrSet(
      cacheKey,
      async () => {
        return runInSpan(
          'Users.getCurrentUser',
          async () => {
            const user = await this.usersRepository.findById(userId);
            if (!user) {
              throw new NotFoundException('User', userId);
            }
            return user;
          },
          { module: 'users', userId },
        );
      },
      GetCurrentUserQuery.CACHE_TTL_SEC,
    );
  }
}
