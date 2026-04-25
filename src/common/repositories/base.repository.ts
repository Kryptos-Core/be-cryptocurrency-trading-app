import { Injectable, Logger } from '@nestjs/common';
import type {
  DataSource,
  DeepPartial,
  EntityManager,
  EntityTarget,
  FindManyOptions,
  FindOneOptions,
  FindOptionsWhere,
  ObjectLiteral,
  Repository,
} from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { calcSkip } from '@/common/utils/pagination.util';
import type { TransactionContext } from '@/common/types/transaction-context';
import type { IRepository } from './interfaces/irepository.interface';

@Injectable()
export abstract class BaseRepository<T extends ObjectLiteral> implements IRepository<T> {
  protected readonly logger: Logger;
  protected _repository: Repository<T> | null = null;
  protected readonly dataSource: DataSource;

  constructor(
    protected readonly entity: EntityTarget<T>,
    dataSource: DataSource,
  ) {
    this.dataSource = dataSource;
    this.logger = new Logger(this.constructor.name);
  }

  protected get repository(): Repository<T> {
    if (!this._repository) this._repository = this.dataSource.getRepository(this.entity);
    return this._repository;
  }

  protected getPrimaryKeyName(): string {
    const metadata = this.dataSource.getMetadata(this.entity);
    const primaryColumns = metadata.primaryColumns;
    if (primaryColumns.length === 0) throw new Error(`Entity ${metadata.name} has no primary key`);
    return primaryColumns[0].propertyName;
  }

  async findById(id: number | string): Promise<T | null> {
    const primaryKeyName = this.getPrimaryKeyName();
    const whereClause = { [primaryKeyName]: id } as unknown as FindOptionsWhere<T>;
    return await this.repository.findOne({ where: whereClause } as FindOneOptions<T>);
  }

  async findOne(options: FindOneOptions<T>): Promise<T | null> { return await this.repository.findOne(options); }
  async find(options?: FindManyOptions<T>): Promise<T[]> { return await this.repository.find(options); }

  async findWithPagination(
    page: number = 1,
    limit: number = 10,
    options?: FindManyOptions<T>,
  ): Promise<{ data: T[]; total: number; page: number; limit: number }> {
    const skip = calcSkip(page, limit);
    const take = limit;
    const [data, total] = await this.repository.findAndCount({ ...options, skip, take });
    return { data, total, page, limit };
  }

  async count(options?: FindManyOptions<T>): Promise<number> { return await this.repository.count(options); }

  async exists(options: FindOptionsWhere<T>): Promise<boolean> {
    return (await this.repository.count({ where: options })) > 0;
  }

  async create(entity: DeepPartial<T>): Promise<T> {
    return await this.repository.save(this.repository.create(entity));
  }

  async createMany(entities: DeepPartial<T>[]): Promise<T[]> {
    return await this.repository.save(this.repository.create(entities));
  }

  async update(id: number | string, entity: DeepPartial<T>): Promise<T> {
    const primaryKeyName = this.getPrimaryKeyName();
    const whereClause = { [primaryKeyName]: id } as unknown as FindOptionsWhere<T>;
    await this.repository.update(whereClause, entity as QueryDeepPartialEntity<T>);
    const updated = await this.findById(id);
    if (!updated) throw new Error(`Entity with ID ${id} not found after update`);
    return updated;
  }

  async updateMany(criteria: FindOptionsWhere<T>, entity: DeepPartial<T>): Promise<number> {
    const result = await this.repository.update(criteria, entity as QueryDeepPartialEntity<T>);
    return result.affected || 0;
  }

  async delete(id: number | string): Promise<void> {
    const primaryKeyName = this.getPrimaryKeyName();
    const whereClause = { [primaryKeyName]: id } as unknown as FindOptionsWhere<T>;
    const result = await this.repository.delete(whereClause);
    if (result.affected === 0) throw new Error(`Entity with ID ${id} not found`);
  }

  async deleteMany(criteria: FindOptionsWhere<T>): Promise<number> {
    const result = await this.repository.delete(criteria);
    return result.affected || 0;
  }

  async save(entity: DeepPartial<T>): Promise<T> { return await this.repository.save(entity); }
  async saveMany(entities: DeepPartial<T>[]): Promise<T[]> { return await this.repository.save(entities); }
  getRepository(): Repository<T> { return this.repository; }
  getDataSource(): DataSource { return this.dataSource; }

  async query<TResult = unknown>(sql: string, parameters?: unknown[]): Promise<TResult> {
    return (await this.dataSource.query(sql, parameters)) as TResult;
  }

  async transaction<R>(fn: (ctx: TransactionContext) => Promise<R>): Promise<R> {
    return await this.dataSource.transaction((manager: EntityManager) =>
      fn(manager as unknown as TransactionContext),
    );
  }
}
