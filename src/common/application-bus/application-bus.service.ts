import { Injectable } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';

/**
 * Thin facade over Nest CQRS buses — inject this from controllers during migration
 * instead of calling `CommandBus` / `QueryBus` directly.
 */
@Injectable()
export class ApplicationBusService {
  constructor(
    readonly commands: CommandBus,
    readonly queries: QueryBus,
  ) {}
}
