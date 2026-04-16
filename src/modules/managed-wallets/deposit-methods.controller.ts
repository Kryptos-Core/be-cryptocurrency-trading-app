import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '@/common/decorators';
import { JwtAuthGuard } from '@/common/guards';
import { GetManagedWalletsQuery } from './application/queries';

@ApiTags('deposit')
@Controller('deposit')
@UseGuards(JwtAuthGuard)
export class DepositMethodsController {
  constructor(private readonly getManagedWalletsQuery: GetManagedWalletsQuery) {}

  @Get('methods')
  @Public()
  @ApiOperation({
    summary: 'Get public deposit methods and the recommended chain',
  })
  async getDepositMethods() {
    return this.getManagedWalletsQuery.getDepositMethods();
  }
}
