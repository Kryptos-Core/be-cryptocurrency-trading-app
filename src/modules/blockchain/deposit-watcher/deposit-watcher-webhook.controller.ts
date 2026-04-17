import { Body, Controller, Headers, Post, UnauthorizedException } from '@nestjs/common';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { BlockchainNetwork } from '@/common/enums';
import { DepositIngestionService } from './deposit-ingestion.service';
import { DepositWatcherConfigService } from './deposit-watcher-config.service';

class DepositWatcherRefreshDto {
  @IsEnum(BlockchainNetwork)
  chain!: BlockchainNetwork;

  @IsString()
  @IsNotEmpty()
  txHash!: string;
}

/**
 * Optional webhook → re-resolve a tx (poller remains the safety net).
 * POST /api/v1/internal/deposit-watcher/refresh
 */
@Controller('internal/deposit-watcher')
export class DepositWatcherWebhookController {
  constructor(
    private readonly cfg: DepositWatcherConfigService,
    private readonly ingestion: DepositIngestionService,
  ) {}

  @Post('refresh')
  async refresh(
    @Headers('x-deposit-watcher-secret') secret: string | undefined,
    @Body() body: DepositWatcherRefreshDto,
  ): Promise<{ ok: true }> {
    if (!this.cfg.validateWebhookSecret(secret)) {
      throw new UnauthorizedException();
    }
    await this.ingestion.ingestTxHash(body.chain, body.txHash.trim());
    return { ok: true };
  }
}
