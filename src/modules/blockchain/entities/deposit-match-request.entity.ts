import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

export type DepositMatchRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface DepositMatchAuditEntry {
  action: 'PROPOSED' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  actor_id: string;
  actor_role: string;
  at: string;
  note?: string;
}

@Entity('deposit_match_requests')
@Index('uk_deposit_match_tx', ['tx_id'], { unique: true })
@Index('idx_deposit_match_proposer_date', ['proposer_id', 'proposed_at'])
@Index('idx_deposit_match_approver_date', ['approver_id', 'resolved_at'])
export class DepositMatchRequest {
  @PrimaryColumn({ type: 'char', length: 36 })
  match_id!: string;

  @Column({ type: 'char', length: 36 })
  tx_id!: string;

  @Column({ type: 'char', length: 36 })
  requested_user_id!: string;

  @Column({ type: 'char', length: 36 })
  proposer_id!: string;

  @Column({ type: 'varchar', length: 50 })
  proposer_role!: string;

  @Column({ type: 'char', length: 36, nullable: true })
  approver_id!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  approver_role!: string | null;

  @Column({
    type: 'enum',
    enum: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'],
    default: 'PENDING',
  })
  status!: DepositMatchRequestStatus;

  @Column({ type: 'varchar', length: 64, unique: true })
  idempotency_key!: string;

  @Column({ type: 'timestamp', precision: 3, default: () => 'CURRENT_TIMESTAMP(3)' })
  proposed_at!: Date;

  @Column({ type: 'timestamp', precision: 3, nullable: true })
  resolved_at!: Date | null;

  @Column({ type: 'json', default: () => '(JSON_ARRAY())' })
  audit_log!: DepositMatchAuditEntry[];
}
