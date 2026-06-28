import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne } from 'typeorm';
import { Driver } from './driver.entity';

export enum DocumentType {
  LICENSE = 'license',
  PERMIT = 'permit',
  REGISTRATION = 'registration',
  AADHAAR = 'aadhaar',
  VEHICLE_PHOTO = 'vehicle_photo',
}

export enum DocumentStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Entity('driver_documents')
export class DriverDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: DocumentType,
  })
  type: DocumentType;

  @Column()
  url: string;

  @Column({
    type: 'enum',
    enum: DocumentStatus,
    default: DocumentStatus.PENDING,
  })
  status: DocumentStatus;

  @Column({ type: 'text', nullable: true })
  comments: string | null;

  @ManyToOne(() => Driver, (driver: Driver) => driver.documents, { onDelete: 'CASCADE' })
  driver: Driver;

  @CreateDateColumn()
  uploadedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  reviewedAt: Date | null;
}
