import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis;
  private readonly logger = new Logger(RedisService.name);

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const host = this.configService.get<string>('REDIS_HOST', 'localhost');
    const port = this.configService.get<number>('REDIS_PORT', 6380);

    this.client = new Redis({
      host,
      port,
      maxRetriesPerRequest: null,
    });

    this.client.on('connect', () => {
      this.logger.log(`Connected to Redis at ${host}:${port}`);
    });

    this.client.on('error', (err: Error) => {
      this.logger.error(`Redis connection error: ${err.message}`);
    });
  }

  onModuleDestroy() {
    this.client.disconnect();
  }

  getClient(): Redis {
    return this.client;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async del(key: string): Promise<number> {
    return this.client.del(key);
  }

  // Update driver GPS coords: GEOADD drivers:locations <lng> <lat> <driverId>
  async updateDriverLocation(driverId: string, lng: number, lat: number): Promise<void> {
    await this.client.geoadd('drivers:locations', lng, lat, driverId);
    this.logger.log(`Redis GEOADD success: Key drivers:locations, Member=${driverId}, Lng=${lng}, Lat=${lat}`);
  }

  // Remove driver from live tracking
  async removeDriverLocation(driverId: string): Promise<void> {
    await this.client.zrem('drivers:locations', driverId);
  }

  // Find nearest drivers: GEORADIUS or GEOSEARCH (returns list of driverIds with distance)
  async findNearbyDrivers(lng: number, lat: number, radiusKm: number): Promise<{ id: string; distance: number }[]> {
    // GEOSEARCH key FROMLONLAT lng lat BYRADIUS radiusKm km WITHDIST ASC
    const results = await this.client.geosearch(
      'drivers:locations',
      'FROMLONLAT',
      lng,
      lat,
      'BYRADIUS',
      radiusKm,
      'km',
      'WITHDIST',
      'ASC'
    );

    if (!results || !Array.isArray(results)) return [];

    return results.map((item: any) => ({
      id: item[0],
      distance: parseFloat(item[1]), // distance in km
    }));
  }

  // Set transient match lock so a driver isn't offered multiple rides simultaneously
  async lockDriverForMatch(driverId: string, durationSeconds = 15): Promise<boolean> {
    const key = `driver:lock:${driverId}`;
    const acquired = await this.client.set(key, 'locked', 'EX', durationSeconds, 'NX');
    return acquired === 'OK';
  }

  async unlockDriver(driverId: string): Promise<void> {
    await this.client.del(`driver:lock:${driverId}`);
  }
}
