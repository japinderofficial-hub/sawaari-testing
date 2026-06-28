import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SosAlert } from './entities/sos-alert.entity';
import { Ride } from '../rides/entities/ride.entity';
import { User } from '../users/entities/user.entity';
import { SosService } from './sos.service';
import { SosController } from './sos.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SosAlert, Ride, User])],
  controllers: [SosController],
  providers: [SosService],
  exports: [SosService],
})
export class SosModule {}
