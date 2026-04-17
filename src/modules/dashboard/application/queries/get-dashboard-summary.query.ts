import { Injectable } from '@nestjs/common';
import { DashboardService } from '../../dashboard.service';
import type { DashboardResponseDto } from '../../dto/dashboard-response.dto';

@Injectable()
export class GetDashboardSummaryQuery {
  constructor(private readonly dashboardService: DashboardService) {}

  execute(userId: string | null): Promise<DashboardResponseDto> {
    return this.dashboardService.getDashboardSummary(userId);
  }
}
