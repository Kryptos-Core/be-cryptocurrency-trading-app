import { applyDecorators } from '@nestjs/common';
import { ApiResponse, type ApiResponseOptions } from '@nestjs/swagger';

/**
 * Extended ApiResponseOptions to support schema
 */
type ExtendedApiResponseOptions = Omit<ApiResponseOptions, 'status' | 'description'> & {
  schema?: {
    example?: any;
    type?: any;
    isArray?: boolean;
  };
};

/**
 * Custom API Response Decorator
 * Wrapper for common response patterns
 */
const apiStandardResponse = (
  statusCode: number,
  description: string,
  options?: ExtendedApiResponseOptions,
) => {
  return applyDecorators(
    ApiResponse({
      status: statusCode,
      description,
      ...options,
    } as ApiResponseOptions),
  );
};

/**
 * Success Response (200)
 */
export const ApiSuccessResponse = (
  description: string = 'Success',
  options?: ExtendedApiResponseOptions,
) => {
  return apiStandardResponse(200, description, options);
};

/**
 * Created Response (201)
 */
export const ApiCreatedResponse = (
  description: string = 'Resource created successfully',
  options?: ExtendedApiResponseOptions,
) => {
  return apiStandardResponse(201, description, options);
};

/**
 * Bad Request Response (400)
 */
export const ApiBadRequestResponse = (
  description: string = 'Bad request',
  options?: ExtendedApiResponseOptions,
) => {
  return apiStandardResponse(400, description, options);
};

/**
 * Unauthorized Response (401)
 */
export const ApiUnauthorizedResponse = (
  description: string = 'Unauthorized',
  options?: ExtendedApiResponseOptions,
) => {
  return apiStandardResponse(401, description, options);
};

/**
 * Forbidden Response (403)
 */
export const ApiForbiddenResponse = (
  description: string = 'Forbidden',
  options?: ExtendedApiResponseOptions,
) => {
  return apiStandardResponse(403, description, options);
};

/**
 * Not Found Response (404)
 */
export const ApiNotFoundResponse = (
  description: string = 'Resource not found',
  options?: ExtendedApiResponseOptions,
) => {
  return apiStandardResponse(404, description, options);
};

/**
 * Conflict Response (409)
 */
export const ApiConflictResponse = (
  description: string = 'Resource conflict',
  options?: ExtendedApiResponseOptions,
) => {
  return apiStandardResponse(409, description, options);
};

/**
 * Internal Server Error Response (500)
 */
export const ApiInternalServerErrorResponse = (
  description: string = 'Internal server error',
  options?: ExtendedApiResponseOptions,
) => {
  return apiStandardResponse(500, description, options);
};
