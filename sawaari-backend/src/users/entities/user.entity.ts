import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToOne, OneToMany } from 'typeorm';
import { Driver } from '../../drivers/entities/driver.entity';
import { SavedLocation } from './saved-location.entity';

export enum UserRole {
  PASSENGER = 'passenger',
  DRIVER = 'driver',
  ADMIN = 'admin',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  phone: string;

  @Column({ type: 'varchar', nullable: true })
  name: string;

  @Column({ type: 'varchar', nullable: true })
  email: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.PASSENGER,
  })
  role: UserRole;

  @Column({ type: 'varchar', nullable: true })
  firebaseUid: string;

  @Column({ type: 'varchar', nullable: true })
  fcmToken?: string;

  @OneToOne(() => Driver, (driver: Driver) => driver.user, { cascade: true, nullable: true })
  driverProfile?: Driver;

  @OneToMany(() => SavedLocation, (loc: SavedLocation) => loc.user)
  savedLocations: SavedLocation[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
