import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DepositWatcherCursor } from '@/entities/deposit-watcher-cursor.entity';

@Injectable()
export class DepositWatcherCursorRepository {
  constructor(private readonly dataSource: DataSource) {}

  async findByChain(chain: string): Promise<DepositWatcherCursor | null> {
    return this.dataSource.getRepository(DepositWatcherCursor).findOne({ where: { chain } });
  }

  async upsertCursor(
    chain: string,
    cursorValue: bigint,
    kind: 'TIMESTAMP_MS' | 'BLOCK_NUMBER',
  ): Promise<void> {
    await this.dataSource.getRepository(DepositWatcherCursor).upsert(
      {
        chain,
        cursor_value: String(cursorValue),
        cursor_kind: kind,
        updated_at: new Date(),
      },
      ['chain'],
    );
  }

  async deleteByChain(chain: string): Promise<void> {
    await this.dataSource.getRepository(DepositWatcherCursor).delete({ chain });
  }

  async deleteAll(): Promise<number> {
    const result = await this.dataSource.getRepository(DepositWatcherCursor).delete({});
    return result.affected ?? 0;
  }
}
