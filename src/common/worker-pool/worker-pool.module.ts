import { DynamicModule, Module } from '@nestjs/common';
import type { WorkerPoolOptions } from './worker-pool.service';
import { WorkerPoolService } from './worker-pool.service';

/**
 * WorkerPoolModule — NestJS dynamic module for registering a Piscina worker pool.
 *
 * Register per-feature (not globally) so each heavy task type gets its own
 * dedicated thread pool with the right concurrency settings.
 *
 * @example
 * // In a feature module:
 * @Module({
 *   imports: [
 *     WorkerPoolModule.forRoot({
 *       workerFile: path.resolve(__dirname, 'workers/crypto-hash.worker'),
 *       maxThreads: 4,
 *     }),
 *   ],
 * })
 * export class ReportsModule {}
 */
@Module({})
// biome-ignore lint/complexity/noStaticOnlyClass: NestJS dynamic module uses static forRoot
export class WorkerPoolModule {
  static forRoot(options: WorkerPoolOptions): DynamicModule {
    return {
      module: WorkerPoolModule,
      providers: [
        {
          provide: WorkerPoolService,
          useFactory: () => new WorkerPoolService(options),
        },
      ],
      exports: [WorkerPoolService],
    };
  }
}
