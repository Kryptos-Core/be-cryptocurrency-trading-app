import { Injectable } from '@nestjs/common';

@Injectable()
export class MarketMakerService {
  getConfigList(userId: string) {
    return {
      userId,
      items: [],
    };
  }

  getDashboard(userId: string) {
    return {
      userId,
      openOrders: [],
      positions: [],
      estimatedPnl: '0',
    };
  }
}
