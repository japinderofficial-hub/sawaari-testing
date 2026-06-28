import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToOne, JoinColumn, OneToMany } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { DriverDocument } from './driver-document.entity';

export enum DriverStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  PENDING_APPROVAL = 'pending_approval',
}

@Entity('drivers')
export class Driver {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => User, (user: User) => user.driverProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ unique: true })
  vehicleNo: string;

  @Column()
  vehicleModel: string;

  @Column({ nullable: true })
  aadhaarNo?: string;

  @Column({ default: false })
  isOnline: boolean;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 5.0 })
  rating: number;

  @Column({
    type: 'enum',
    enum: DriverStatus,
    default: DriverStatus.PENDING_APPROVAL,
  })
  status: DriverStatus;

  @OneToMany(() => DriverDocument, (doc: DriverDocument) => doc.driver, { cascade: true })
  documents: DriverDocument[];

  @Column({ type: 'timestamp', nullable: true })
  lastOnlineAt: Date; // For matching algorithm idle time priority

  @Column({ type: 'timestamp', nullable: true })
  lastRideCompletedAt: Date; // Helper to calculate exact idle duration

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
