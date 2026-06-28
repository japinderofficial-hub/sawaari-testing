import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Ride } from './entities/ride.entity';
import { User } from '../users/entities/user.entity';
import { Driver } from '../drivers/entities/driver.entity';
import { RidesService } from './rides.service';
import { RidesController } from './rides.controller';
import { RedisModule } from '../redis/redis.module';
import { SocketsModule } from '../sockets/sockets.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Ride, User, Driver]),
    RedisModule,
    forwardRef(() => SocketsModule),
  ],
  controllers: [RidesController],
  providers: [RidesService],
  exports: [RidesService],
})
export class RidesModule {}
