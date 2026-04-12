import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('app_settings')
export class AppSetting {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  k!: string;

  @Column({ type: 'varchar', length: 2048 })
  v!: string;

  @UpdateDateColumn()
  updated_at!: Date;
}
