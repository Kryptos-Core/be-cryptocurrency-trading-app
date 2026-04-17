import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '@/common/decorators';
import { JwtAuthGuard } from '@/common/guards';
import { GetDepositMethodsQuery, GetDepositMethodsRequest } from './application/queries';

@ApiTags('deposit')
@Controller('deposit')
@UseGuards(JwtAuthGuard)
export class DepositMethodsController {
  constructor(private readonly getDepositMethodsQuery: GetDepositMethodsQuery) {}

  @Get('methods')
  @Public()
  @ApiOperation({
    summary: 'Get public deposit methods and the recommended chain',
  })
  async getDepositMethods() {
    return this.getDepositMethodsQuery.execute(new GetDepositMethodsRequest());
  }
}
