import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators';
import { JwtAuthGuard } from '@/common/guards';
import {
  SaveBinanceCredentialsDto,
  BinanceCredentialsSummaryDto,
  SaveBinanceCredentialsResponseDto,
  TestConnectionResponseDto,
} from './dto';
import { UserBinanceCredentialsService } from './user-binance-credentials.service';

@ApiTags('binance-credentials')
@ApiBearerAuth('JWT-auth')
@Controller('binance-credentials')
@UseGuards(JwtAuthGuard)
export class UserBinanceCredentialsController {
  constructor(private readonly service: UserBinanceCredentialsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Save Binance API credentials for the authenticated user' })
  async saveCredentials(
    @CurrentUser('userId') userId: string,
    @Body() dto: SaveBinanceCredentialsDto,
  ): Promise<SaveBinanceCredentialsResponseDto> {
    return this.service.saveCredentials(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all Binance API credentials for the authenticated user' })
  async listCredentials(
    @CurrentUser('userId') userId: string,
  ): Promise<BinanceCredentialsSummaryDto[]> {
    return this.service.listCredentials(userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete (deactivate) a Binance API credential' })
  async deleteCredential(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ): Promise<void> {
    await this.service.deleteCredential(userId, id);
  }

  @Post(':id/test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Test connection to Binance using stored credentials' })
  async testConnection(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ): Promise<TestConnectionResponseDto> {
    return this.service.testConnection(userId, id);
  }
}
