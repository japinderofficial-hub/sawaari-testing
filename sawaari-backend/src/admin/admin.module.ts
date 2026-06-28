import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Driver } from '../drivers/entities/driver.entity';
import { DriverDocument } from '../drivers/entities/driver-document.entity';
import { Ride } from '../rides/entities/ride.entity';
import { AdminController } from './admin.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Driver, DriverDocument, Ride])],
  controllers: [AdminController],
})
export class AdminModule {}
