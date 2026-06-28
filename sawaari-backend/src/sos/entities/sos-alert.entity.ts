import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, Index } from 'typeorm';
import { Ride } from '../../rides/entities/ride.entity';
import { User } from '../../users/entities/user.entity';

export enum SosStatus {
  ACTIVE = 'active',
  RESOLVED = 'resolved',
}

@Entity('sos_alerts')
export class SosAlert {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Ride, { onDelete: 'CASCADE' })
  ride: Ride;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  reporter: User;

  @Column({
    type: 'varchar',
    length: 20,
  })
  reporterRole: string; // 'passenger' | 'driver'

  @Index({ spatial: true })
  @Column({
    type: 'geometry',
    spatialFeatureType: 'Point',
    srid: 4326,
  })
  location: {
    type: 'Point';
    coordinates: [number, number]; // [longitude, latitude]
  };

  @Column({
    type: 'enum',
    enum: SosStatus,
    default: SosStatus.ACTIVE,
  })
  status: SosStatus;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  resolvedBy?: User; // Admin user

  @Column({ type: 'text', nullable: true })
  resolutionNotes?: string;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  resolvedAt?: Date;
}
