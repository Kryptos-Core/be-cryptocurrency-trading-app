import {
  Entity,
  PrimaryColumn,
  Column,
  ManyToOne,
  ForeignKey,
  Index,
} from 'typeorm';
import { MarketPair } from './market-pair.entity';

@Entity('ohlcv')
@Index('idx_ohlcv_time', ['open_time'])
export class OHLCV {
  @PrimaryColumn({ type: 'int' })
  @ForeignKey(() => MarketPair)
  pair_id!: number;

  @PrimaryColumn({ type: 'int' })
  interval_sec!: number;

  @PrimaryColumn({ type: 'datetime' })
  open_time!: Date;

  @Column({ type: 'decimal', precision: 36, scale: 18 })
  open!: string;

  @Column({ type: 'decimal', precision: 36, scale: 18 })
  high!: string;

  @Column({ type: 'decimal', precision: 36, scale: 18 })
  low!: string;

  @Column({ type: 'decimal', precision: 36, scale: 18 })
  close!: string;

  @Column({ type: 'decimal', precision: 36, scale: 18 })
  volume!: string;

  @ManyToOne(() => MarketPair, (pair) => pair.ohlcv_data, {
    onDelete: 'CASCADE',
  })
  pair!: MarketPair;
}
