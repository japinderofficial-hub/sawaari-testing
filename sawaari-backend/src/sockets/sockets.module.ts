import { Module, forwardRef } from '@nestjs/common';
import { SocketsGateway } from './sockets.gateway';
import { AuthModule } from '../auth/auth.module';
import { RedisModule } from '../redis/redis.module';
import { RidesModule } from '../rides/rides.module';

@Module({
  imports: [
    AuthModule,
    RedisModule,
    forwardRef(() => RidesModule),
  ],
  providers: [SocketsGateway],
  exports: [SocketsGateway],
})
export class SocketsModule {}
