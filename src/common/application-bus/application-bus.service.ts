import { Injectable } from '@nestjs/common';
import { CommandBus, type ICommand, type IQuery, QueryBus } from '@nestjs/cqrs';

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

  executeCommand<TResult = void, TCommand extends ICommand = ICommand>(
    command: TCommand,
  ): Promise<TResult> {
    return this.commands.execute(command) as Promise<TResult>;
  }

  executeQuery<TResult, TQuery extends IQuery = IQuery>(query: TQuery): Promise<TResult> {
    return this.queries.execute(query) as Promise<TResult>;
  }
}
