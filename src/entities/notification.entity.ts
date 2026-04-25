import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
} from 'typeorm';
import { User } from './user.entity';
import { UserNotification } from './user-notification.entity';

export type NotificationType = 'system' | 'alert' | 'promo';

@Entity('notifications')
@Index('idx_notifications_created_at', ['created_at'])
export class Notification {
  @PrimaryColumn({ type: 'char', length: 36 })
  notification_id!: string;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'text' })
  body!: string;

  @Column({ type: 'enum', enum: ['system', 'alert', 'promo'], default: 'system' })
  type!: NotificationType;

  @Column({ type: 'char', length: 36 })
  created_by!: string;

  @Column({ type: 'json', nullable: true })
  data!: Record<string, unknown> | null;

  @CreateDateColumn({ precision: 3 })
  created_at!: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  creator!: User;

  @OneToMany(() => UserNotification, (un) => un.notification)
  user_notifications!: UserNotification[];
}
