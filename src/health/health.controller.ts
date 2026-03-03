import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Public } from '@/common/decorators';

/**
 * Health check endpoint for connectivity verification.
 * Use GET /api/v1/health from browser or curl to confirm backend is reachable.
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  @Public()
  @Get()
  @ApiOperation({ summary: 'Health check', description: 'Returns 200 if API is up. Use to verify backend is reachable (e.g. before login).' })
  @ApiResponse({ status: 200, description: 'API is running' })
  check() {
    return { ok: true, timestamp: new Date().toISOString() };
  }
}
