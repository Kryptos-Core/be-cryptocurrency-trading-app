import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryColumn } from 'typeorm';
import { Notification } from './notification.entity';
import { User } from './user.entity';

@Entity('user_notifications')
@Index('uk_user_notif', ['user_id', 'notification_id'], { unique: true })
@Index('idx_un_user_unread', ['user_id', 'is_read'])
export class UserNotification {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Column({ type: 'char', length: 36 })
  user_id!: string;

  @Column({ type: 'char', length: 36 })
  notification_id!: string;

  @Column({ type: 'tinyint', width: 1, default: 0 })
  is_read!: number;

  @Column({ type: 'datetime', precision: 3, nullable: true })
  read_at!: Date | null;

  @CreateDateColumn({ precision: 3 })
  created_at!: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user!: User;

  @ManyToOne(
    () => Notification,
    (n) => n.user_notifications,
    { onDelete: 'CASCADE' },
  )
  notification!: Notification;
}
