import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';
import { RedisService } from '../redis/redis.service';
import { Inject, forwardRef, Logger } from '@nestjs/common';
import { RidesService } from '../rides/rides.service';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class SocketsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(SocketsGateway.name);
  private userSockets = new Map<string, string>(); // Maps userId -> socketId

  constructor(
    private authService: AuthService,
    private redisService: RedisService,
    @Inject(forwardRef(() => RidesService))
    private ridesService: RidesService
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.query.token as string || client.handshake.auth.token as string;
      if (!token) {
        this.logger.warn('Disconnecting unauthorized client (Missing token)');
        client.disconnect();
        return;
      }

      const payload = this.authService.verifyJwt(token);
      client.data.user = payload;

      this.userSockets.set(payload.id, client.id);
      client.join(`user_${payload.id}`);

      if (payload.role === 'driver') {
        client.join('drivers_channel');
        this.logger.log(`Driver connected: ${payload.id} (Socket: ${client.id})`);
      } else {
        this.logger.log(`Passenger connected: ${payload.id} (Socket: ${client.id})`);
      }
    } catch (e) {
      this.logger.warn(`Disconnecting client: Authentication failed - ${e.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const user = client.data.user;
    if (user) {
      this.userSockets.delete(user.id);
      if (user.role === 'driver') {
        // Automatically offline in Redis on socket drop (or allow grace period)
        this.redisService.removeDriverLocation(user.id).catch((err) => {
          this.logger.error(`Failed to clean up driver location: ${err.message}`);
        });
      }
      this.logger.log(`User disconnected: ${user.id}`);
    }
  }

  @SubscribeMessage('driver_location_update')
  async handleLocationUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { latitude: number; longitude: number; bearing: number }
  ) {
    const user = client.data.user;
    if (!user || user.role !== 'driver') return;

    this.logger.log(`Driver ${user.id} going ONLINE / updating location: lat=${payload.latitude}, lng=${payload.longitude}`);

    // 1. Update location in Redis GEO index
    await this.redisService.updateDriverLocation(user.id, payload.longitude, payload.latitude);

    // 2. Fetch active ride to check if we should broadcast to passenger
    const activeRide = await this.ridesService.getActiveRideForUser(user.id, 'driver');
    if (activeRide && activeRide.passenger) {
      this.server.to(`user_${activeRide.passenger.id}`).emit('driver_location_changed', {
        latitude: payload.latitude,
        longitude: payload.longitude,
        bearing: payload.bearing,
      });
    }
  }

  // --- Dispatch Utilities called by RidesService ---

  sendRideOfferToDriver(driverUserId: string, payload: any) {
    this.server.to(`user_${driverUserId}`).emit('ride_offer', payload);
  }

  notifyPassengerRideAccepted(passengerUserId: string, payload: any) {
    this.server.to(`user_${passengerUserId}`).emit('ride_accepted', payload);
  }

  notifyPassengerDriverArrived(passengerUserId: string) {
    this.server.to(`user_${passengerUserId}`).emit('driver_arrived', { otpRequired: true });
  }

  notifyRideStarted(passengerUserId: string) {
    this.server.to(`user_${passengerUserId}`).emit('ride_started', {});
  }

  notifyRideCompleted(passengerUserId: string, payload: any) {
    this.server.to(`user_${passengerUserId}`).emit('ride_completed', payload);
  }

  notifyRideFailed(passengerUserId: string, message: string) {
    this.server.to(`user_${passengerUserId}`).emit('ride_failed', { message });
  }

  notifyRideCancelledByOpponent(targetUserId: string, message: string) {
    this.server.to(`user_${targetUserId}`).emit('ride_cancelled', { message });
  }
}
