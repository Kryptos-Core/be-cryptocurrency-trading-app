import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '@/common/decorators';
import { JwtAuthGuard } from '@/common/guards';
import { ManagedWalletsService } from './managed-wallets.service';

@ApiTags('deposit')
@Controller('deposit')
@UseGuards(JwtAuthGuard)
export class DepositMethodsController {
  constructor(private readonly managedWalletsService: ManagedWalletsService) {}

  @Get('methods')
  @Public()
  @ApiOperation({
    summary: 'Get public deposit methods and the recommended chain',
  })
  async getDepositMethods() {
    return this.managedWalletsService.getDepositMethods();
  }
}
