import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Custom Decorator để lấy current user từ request
 * Dùng sau khi JwtAuthGuard đã inject user vào request
 * 
 * Usage:
 * @Get('profile')
 * @UseGuards(JwtAuthGuard)
 * getProfile(@CurrentUser() user: any) {
 *   return user;
 * }
 */
export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;

    return data ? user?.[data] : user;
  },
);
