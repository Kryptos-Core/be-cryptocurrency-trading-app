import { Injectable } from '@nestjs/common';
import type { WorkspaceState } from '../../interfaces/websocket.interface';
import { WorkspaceService } from '../../services/workspace.service';

@Injectable()
export class GetWorkspaceStateQuery {
  constructor(private readonly workspaceService: WorkspaceService) {}

  execute(userId: string): Promise<WorkspaceState | null> {
    return this.workspaceService.getWorkspace(userId);
  }
}
