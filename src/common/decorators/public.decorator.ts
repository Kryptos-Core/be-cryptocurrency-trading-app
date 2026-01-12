import { SetMetadata } from '@nestjs/common';

/**
 * Public Decorator - Mark routes that don't require JWT authentication
 */
export const Public = () => SetMetadata('isPublic', true);
