import { Module } from '@nestjs/common';
import { MarketMakerController } from './market-maker.controller';
import { MarketMakerService } from './market-maker.service';

@Module({
  controllers: [MarketMakerController],
  providers: [MarketMakerService],
  exports: [MarketMakerService],
})
export class MarketMakerModule {}
