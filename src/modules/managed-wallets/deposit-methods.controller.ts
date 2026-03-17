import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ManagedWalletsService } from './managed-wallets.service';
import { Public } from '@/common/decorators';
import { JwtAuthGuard } from '@/common/guards';

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
