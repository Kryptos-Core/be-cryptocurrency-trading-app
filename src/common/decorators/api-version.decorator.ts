import { applyDecorators, Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

/**
 * API Version Decorator
 * Adds version prefix and Swagger tag
 */
export const ApiVersion = (version: string = 'v1') => {
  return applyDecorators(
    Controller(`api/${version}`),
    ApiTags(`v${version}`),
  );
};

/**
 * API Version 1
 */
export const ApiV1 = () => ApiVersion('v1');

/**
 * API Version 2
 */
export const ApiV2 = () => ApiVersion('v2');
