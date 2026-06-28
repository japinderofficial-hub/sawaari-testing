import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, Index } from 'typeorm';
import { User } from './user.entity';

export enum LocationType {
  HOME = 'home',
  WORK = 'work',
  RECENT = 'recent',
}

@Entity('saved_locations')
export class SavedLocation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string; // e.g. "Home", "Tech Park"

  @Column({
    type: 'enum',
    enum: LocationType,
  })
  type: LocationType;

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

  @Column('text')
  address: string;

  @ManyToOne(() => User, (user: User) => user.savedLocations, { onDelete: 'CASCADE' })
  user: User;

  @CreateDateColumn()
  createdAt: Date;
}
