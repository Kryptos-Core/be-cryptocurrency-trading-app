import * as os from 'node:os';
import * as path from 'node:path';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Piscina from 'piscina';

const DEFAULT_MIN_THREADS = 1;
const DEFAULT_MAX_THREADS = Math.max(1, os.cpus().length - 1);

export interface WorkerPoolOptions {
  /** Absolute path to the compiled worker script (.js in production, .ts in dev). */
  workerFile: string;
  minThreads?: number;
  maxThreads?: number;
  idleTimeout?: number;
  /** Extra arguments passed to the Node.js worker thread (e.g. ['-r', 'ts-node/register']). */
  execArgv?: string[];
}

/**
 * WorkerPoolService — NestJS-managed wrapper around Piscina (Node.js worker threads).
 *
 * Use for CPU-bound tasks (e.g., cryptographic hashing, report generation, heavy
 * serialization) that would otherwise block the event loop.
 *
 * Usage:
 *   // In your module:
 *   WorkerPoolModule.forRoot({ workerFile: './workers/my-task.worker' })
 *
 *   // In your service:
 *   const result = await this.workerPool.run({ ...taskData });
 *
 * Worker file contract:
 *   The worker script must export a default function (sync or async):
 *     export default function (input: MyInput): MyOutput { ... }
 */
@Injectable()
export class WorkerPoolService implements OnModuleDestroy {
  private readonly logger = new Logger(WorkerPoolService.name);
  private readonly pool: Piscina;

  constructor(options: WorkerPoolOptions) {
    this.pool = new Piscina({
      filename: path.resolve(path.dirname(options.workerFile), path.basename(options.workerFile)),
      minThreads: options.minThreads ?? DEFAULT_MIN_THREADS,
      maxThreads: options.maxThreads ?? DEFAULT_MAX_THREADS,
      idleTimeout: options.idleTimeout ?? 30_000,
      ...(options.execArgv ? { execArgv: options.execArgv } : {}),
    });

    this.logger.log(
      `WorkerPool initialised — minThreads=${options.minThreads ?? DEFAULT_MIN_THREADS} ` +
      `maxThreads=${options.maxThreads ?? DEFAULT_MAX_THREADS} ` +
      `worker=${options.workerFile}`,
    );
  }

  /**
   * Schedule a task on the thread pool.
   * @param data Input serialised to the worker thread.
   */
  async run<TIn, TOut>(data: TIn): Promise<TOut> {
    return this.pool.run(data) as Promise<TOut>;
  }

  /** Current number of threads alive in the pool. */
  get threads(): number {
    return this.pool.threads.length;
  }

  /** Number of tasks currently queued (not yet picked up by a thread). */
  get queueSize(): number {
    return this.pool.queueSize;
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.destroy();
    this.logger.log('WorkerPool destroyed');
  }
}
