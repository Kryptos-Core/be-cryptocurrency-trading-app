import { applyDecorators } from '@nestjs/common';
import { ApiResponse, type ApiResponseOptions } from '@nestjs/swagger';

type ApiSchemaOptions = {
  example?: unknown;
  type?: unknown;
  isArray?: boolean;
};

type ExtendedApiResponseOptions = Omit<ApiResponseOptions, 'status' | 'description'> & {
  schema?: ApiSchemaOptions;
};

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

export const ApiSuccessResponse = (
  description: string = 'Success',
  options?: ExtendedApiResponseOptions,
) => apiStandardResponse(200, description, options);

export const ApiCreatedResponse = (
  description: string = 'Resource created successfully',
  options?: ExtendedApiResponseOptions,
) => apiStandardResponse(201, description, options);

export const ApiBadRequestResponse = (
  description: string = 'Bad request',
  options?: ExtendedApiResponseOptions,
) => apiStandardResponse(400, description, options);

export const ApiUnauthorizedResponse = (
  description: string = 'Unauthorized',
  options?: ExtendedApiResponseOptions,
) => apiStandardResponse(401, description, options);

export const ApiForbiddenResponse = (
  description: string = 'Forbidden',
  options?: ExtendedApiResponseOptions,
) => apiStandardResponse(403, description, options);

export const ApiNotFoundResponse = (
  description: string = 'Resource not found',
  options?: ExtendedApiResponseOptions,
) => apiStandardResponse(404, description, options);

export const ApiConflictResponse = (
  description: string = 'Resource conflict',
  options?: ExtendedApiResponseOptions,
) => apiStandardResponse(409, description, options);

export const ApiInternalServerErrorResponse = (
  description: string = 'Internal server error',
  options?: ExtendedApiResponseOptions,
) => apiStandardResponse(500, description, options);
