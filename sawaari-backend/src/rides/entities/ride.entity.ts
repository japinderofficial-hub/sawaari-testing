import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, Index } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Driver } from '../../drivers/entities/driver.entity';

export enum RideStatus {
  REQUESTED = 'requested',
  ACCEPTED = 'accepted',
  ARRIVED = 'arrived',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

@Entity('rides')
export class Ride {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  passenger: User;

  @ManyToOne(() => Driver, { onDelete: 'SET NULL', nullable: true })
  driver?: Driver;

  @Column({
    type: 'enum',
    enum: RideStatus,
    default: RideStatus.REQUESTED,
  })
  status: RideStatus;

  @Index({ spatial: true })
  @Column({
    type: 'geometry',
    spatialFeatureType: 'Point',
    srid: 4326,
  })
  pickupLocation: {
    type: 'Point';
    coordinates: [number, number]; // [longitude, latitude]
  };

  @Column('text')
  pickupAddress: string;

  @Index({ spatial: true })
  @Column({
    type: 'geometry',
    spatialFeatureType: 'Point',
    srid: 4326,
  })
  dropoffLocation: {
    type: 'Point';
    coordinates: [number, number]; // [longitude, latitude]
  };

  @Column('text')
  dropoffAddress: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  fare: number;

  @Column('integer')
  distanceMeters: number;

  @Column('integer')
  durationSeconds: number;

  @Column({ length: 4 })
  otp: string;

  @Column({ type: 'varchar', nullable: true })
  cancellationReason?: string;

  @Column({ type: 'varchar', nullable: true })
  cancelledBy?: string; // 'passenger' | 'driver'

  @Column({ type: 'integer', nullable: true })
  rating?: number; // 1-5

  @Column({ type: 'text', nullable: true })
  review?: string;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  acceptedAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  arrivedAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  startedAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  cancelledAt?: Date;
}
