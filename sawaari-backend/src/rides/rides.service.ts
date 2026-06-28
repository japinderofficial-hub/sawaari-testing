import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Inject, forwardRef, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ride, RideStatus } from './entities/ride.entity';
import { User } from '../users/entities/user.entity';
import { Driver, DriverStatus } from '../drivers/entities/driver.entity';
import { CreateRideDto } from './dto/create-ride.dto';
import { RateRideDto } from './dto/rate-ride.dto';
import { RedisService } from '../redis/redis.service';
import { SocketsGateway } from '../sockets/sockets.gateway';

@Injectable()
export class RidesService {
  private readonly logger = new Logger(RidesService.name);

  constructor(
    @InjectRepository(Ride)
    private rideRepository: Repository<Ride>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Driver)
    private driverRepository: Repository<Driver>,
    private redisService: RedisService,
    @Inject(forwardRef(() => SocketsGateway))
    private socketsGateway: SocketsGateway
  ) {}

  // Helper: Haversine distance in Km between two points
  private getHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Radius of the earth in km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
  }

  // Calculate pricing based on routing distance
  async getEstimate(pickup: { lat: number; lng: number }, dropoff: { lat: number; lng: number }) {
    // Estimate straight-line distance and adjust by 1.3 to simulate driving path distance
    const distanceKm = this.getHaversineDistance(pickup.lat, pickup.lng, dropoff.lat, dropoff.lng) * 1.3;
    const distanceMeters = Math.round(distanceKm * 1000);

    // Speed: 20 km/h average for auto-rickshaws in traffic (3 minutes per km)
    const durationSeconds = Math.round((distanceKm / 20) * 3600);

    // Pricing Model:
    // Base fare: Rs. 30 (first 1.5 Km)
    // Distance fare: Rs. 13 per Km after 1.5 Km
    // Time fare: Rs. 1.5 per minute
    let fare = 30;
    if (distanceKm > 1.5) {
      fare += (distanceKm - 1.5) * 13;
    }
    fare += (durationSeconds / 60) * 1.5;

    return {
      fare: parseFloat(fare.toFixed(2)),
      distanceMeters,
      durationSeconds,
    };
  }

  async getActiveRideForUser(userId: string, role: 'passenger' | 'driver'): Promise<Ride | null> {
    if (role === 'passenger') {
      return this.rideRepository.findOne({
        where: [
          { passenger: { id: userId }, status: RideStatus.REQUESTED },
          { passenger: { id: userId }, status: RideStatus.ACCEPTED },
          { passenger: { id: userId }, status: RideStatus.ARRIVED },
          { passenger: { id: userId }, status: RideStatus.IN_PROGRESS },
        ],
        relations: { passenger: true, driver: { user: true } },
      });
    } else {
      return this.rideRepository.findOne({
        where: [
          { driver: { user: { id: userId } }, status: RideStatus.ACCEPTED },
          { driver: { user: { id: userId } }, status: RideStatus.ARRIVED },
          { driver: { user: { id: userId } }, status: RideStatus.IN_PROGRESS },
        ],
        relations: { passenger: true, driver: { user: true } },
      });
    }
  }

  async requestRide(passengerId: string, dto: CreateRideDto): Promise<Ride> {
    // 1. Confirm passenger doesn't already have an active ride
    const active = await this.getActiveRideForUser(passengerId, 'passenger');
    if (active) {
      throw new BadRequestException('You already have an active ride booking');
    }

    const passenger = await this.userRepository.findOne({ where: { id: passengerId } });
    if (!passenger) {
      throw new NotFoundException('Passenger profile not found');
    }

    const { fare, distanceMeters, durationSeconds } = await this.getEstimate(
      { lat: dto.pickupLatitude, lng: dto.pickupLongitude },
      { lat: dto.dropoffLatitude, lng: dto.dropoffLongitude }
    );

    const otp = Math.floor(1000 + Math.random() * 9000).toString(); // 4-digit numeric OTP

    const ride = this.rideRepository.create({
      passenger,
      status: RideStatus.REQUESTED,
      pickupLocation: {
        type: 'Point',
        coordinates: [dto.pickupLongitude, dto.pickupLatitude],
      },
      pickupAddress: dto.pickupAddress,
      dropoffLocation: {
        type: 'Point',
        coordinates: [dto.dropoffLongitude, dto.dropoffLatitude],
      },
      dropoffAddress: dto.dropoffAddress,
      fare,
      distanceMeters,
      durationSeconds,
      otp,
    });

    const savedRide = await this.rideRepository.save(ride);

    this.logger.log(`Ride requested. Ride ID: ${savedRide.id}, Pickup coords: lat=${dto.pickupLatitude}, lng=${dto.pickupLongitude}`);

    // 2. Trigger asynchronous matching sequence in background
    this.startMatchingSequence(savedRide.id, dto.pickupLatitude, dto.pickupLongitude);

    return savedRide;
  }

  // Core Matching Algorithm: Matches based on distance, idle time, and ratings
  private async startMatchingSequence(rideId: string, pickupLat: number, pickupLng: number) {
    this.logger.log(`Starting matching sequence for Ride ${rideId}`);
    const searchRadii = [3, 5, 8]; // Radius rings (km)

    for (const radius of searchRadii) {
      // 1. Check if the ride has already been accepted or cancelled during expansion delays
      const currentRide = await this.rideRepository.findOne({ where: { id: rideId } });
      if (!currentRide || currentRide.status !== RideStatus.REQUESTED) {
        this.logger.log(`Matching loop stopped: Ride ${rideId} is already ${currentRide?.status || 'deleted'}`);
        return;
      }

      // 2. Query nearby drivers within radius from Redis
      const nearbyDrivers = await this.redisService.findNearbyDrivers(pickupLng, pickupLat, radius);
      
      this.logger.log(`GEOSEARCH results for ${radius}km: ${JSON.stringify(nearbyDrivers)}`);

      if (nearbyDrivers.length === 0) {
        this.logger.log(`No drivers found within ${radius}km for Ride ${rideId}. Expanding search...`);
        continue;
      }

      this.logger.log(`Candidate IDs received from Redis for Ride ${rideId} at ${radius}km: ${nearbyDrivers.map(d => d.id).join(', ')}`);

      // 3. Score and filter candidates
      const candidateScores: { driver: Driver; score: number; distance: number }[] = [];

      for (const item of nearbyDrivers) {
        // Resolve database record for online & approval checks
        const driver = await this.driverRepository.findOne({
          where: { user: { id: item.id }, status: DriverStatus.ACTIVE },
          relations: { user: true },
        });

        if (!driver) continue;

        // Skip if driver is currently locked for another match
        const locked = await this.redisService.lockDriverForMatch(driver.id);
        if (!locked) continue;

        // Skip if driver is currently on an active ride
        const hasActiveRide = await this.getActiveRideForUser(driver.user.id, 'driver');
        if (hasActiveRide) {
          await this.redisService.unlockDriver(driver.id);
          continue;
        }

        // Calculate Idle Time: Time since went online or completed last ride
        const referenceTime = driver.lastRideCompletedAt || driver.lastOnlineAt || driver.createdAt;
        const idleTimeSeconds = Math.max(0, (Date.now() - new Date(referenceTime).getTime()) / 1000);
        const idleTimeMinutes = idleTimeSeconds / 60;

        // Formula:
        // Score = 10.0 * rating + 0.5 * idleTimeMinutes - 5.0 * distanceKm
        const score = 10.0 * Number(driver.rating) + 0.5 * idleTimeMinutes - 5.0 * item.distance;

        candidateScores.push({ driver, score, distance: item.distance });
      }

      // Sort candidates by score descending
      candidateScores.sort((a, b) => b.score - a.score);

      // 4. Offer ride sequentially to sorted drivers
      for (const candidate of candidateScores) {
        const { driver } = candidate;

        this.logger.log(`Offering Ride ${rideId} to Driver ${driver.id} (Score: ${candidate.score.toFixed(2)})`);

        // Send offer event via Socket.IO
        this.socketsGateway.sendRideOfferToDriver(driver.user.id, {
          rideId,
          pickupAddress: currentRide.pickupAddress,
          dropoffAddress: currentRide.dropoffAddress,
          fare: currentRide.fare,
          distanceMeters: currentRide.distanceMeters,
          pickupCoordinates: {
            lat: currentRide.pickupLocation.coordinates[1],
            lng: currentRide.pickupLocation.coordinates[0],
          },
        });

        // Wait 15 seconds for driver acceptance response
        await new Promise((resolve) => setTimeout(resolve, 15000));

        // Re-read ride status to verify acceptance
        const checkedRide = await this.rideRepository.findOne({
          where: { id: rideId },
          relations: { driver: true },
        });

        if (checkedRide && checkedRide.status === RideStatus.ACCEPTED) {
          this.logger.log(`Ride ${rideId} successfully accepted by Driver ${driver.id}`);
          return;
        }

        // Driver timed out or rejected, unlock driver for other queries
        await this.redisService.unlockDriver(driver.id);
      }
    }

    // If matching exhaustively fails after all rings
    const finalCheckRide = await this.rideRepository.findOne({
      where: { id: rideId },
      relations: { passenger: true },
    });
    if (finalCheckRide && finalCheckRide.status === RideStatus.REQUESTED) {
      finalCheckRide.status = RideStatus.CANCELLED;
      finalCheckRide.cancellationReason = 'No drivers available in your area';
      await this.rideRepository.save(finalCheckRide);

      this.socketsGateway.notifyRideFailed(finalCheckRide.passenger.id, 'No drivers available in your area');
      this.logger.log(`Ride ${rideId} cancelled: No available drivers found`);
    }
  }

  async acceptRide(driverUserId: string, rideId: string): Promise<Ride> {
    const driver = await this.driverRepository.findOne({
      where: { user: { id: driverUserId } },
      relations: { user: true },
    });

    if (!driver) {
      throw new NotFoundException('Driver profile not found');
    }

    const ride = await this.rideRepository.findOne({
      where: { id: rideId },
      relations: { passenger: true },
    });

    if (!ride) {
      throw new NotFoundException('Ride not found');
    }

    if (ride.status !== RideStatus.REQUESTED) {
      throw new BadRequestException('Ride is no longer available');
    }

    ride.driver = driver;
    ride.status = RideStatus.ACCEPTED;
    ride.acceptedAt = new Date();

    const updatedRide = await this.rideRepository.save(ride);

    // Notify Passenger that driver accepted
    this.socketsGateway.notifyPassengerRideAccepted(ride.passenger.id, {
      rideId: ride.id,
      status: RideStatus.ACCEPTED,
      driverName: driver.user.name || 'Sawaari Driver',
      vehicleNo: driver.vehicleNo,
      vehicleModel: driver.vehicleModel,
      rating: driver.rating,
    });

    return updatedRide;
  }

  async driverArrivedAtPickup(driverUserId: string, rideId: string): Promise<Ride> {
    const ride = await this.rideRepository.findOne({
      where: { id: rideId, driver: { user: { id: driverUserId } } },
      relations: { passenger: true },
    });

    if (!ride) {
      throw new NotFoundException('Active ride assignment not found');
    }

    if (ride.status !== RideStatus.ACCEPTED) {
      throw new BadRequestException('Ride status cannot transition to arrived from ' + ride.status);
    }

    ride.status = RideStatus.ARRIVED;
    ride.arrivedAt = new Date();

    const updatedRide = await this.rideRepository.save(ride);

    // Emit event to passenger
    this.socketsGateway.notifyPassengerDriverArrived(ride.passenger.id);

    return updatedRide;
  }

  async startRide(driverUserId: string, rideId: string, otp: string): Promise<Ride> {
    const ride = await this.rideRepository.findOne({
      where: { id: rideId, driver: { user: { id: driverUserId } } },
      relations: { passenger: true },
    });

    if (!ride) {
      throw new NotFoundException('Active ride assignment not found');
    }

    if (ride.status !== RideStatus.ARRIVED) {
      throw new BadRequestException('Ride can only start after driver has arrived at pickup');
    }

    if (ride.otp !== otp) {
      throw new BadRequestException('Invalid OTP. Please verify with the passenger.');
    }

    ride.status = RideStatus.IN_PROGRESS;
    ride.startedAt = new Date();

    const updatedRide = await this.rideRepository.save(ride);

    // Emit event to passenger
    this.socketsGateway.notifyRideStarted(ride.passenger.id);

    return updatedRide;
  }

  async completeRide(driverUserId: string, rideId: string): Promise<Ride> {
    const ride = await this.rideRepository.findOne({
      where: { id: rideId, driver: { user: { id: driverUserId } } },
      relations: { passenger: true, driver: true },
    });

    if (!ride) {
      throw new NotFoundException('Active ride assignment not found');
    }

    if (ride.status !== RideStatus.IN_PROGRESS) {
      throw new BadRequestException('Only in-progress rides can be completed');
    }

    ride.status = RideStatus.COMPLETED;
    ride.completedAt = new Date();

    const updatedRide = await this.rideRepository.save(ride);

    // Update driver's last ride completed timestamp to refresh idle tracking priority
    const driver = ride.driver;
    if (driver) {
      driver.lastRideCompletedAt = new Date();
      await this.driverRepository.save(driver);
    }

    // Emit event to passenger
    this.socketsGateway.notifyRideCompleted(ride.passenger.id, {
      rideId: ride.id,
      fare: ride.fare,
    });

    return updatedRide;
  }

  async cancelRide(userId: string, rideId: string, reason: string): Promise<Ride> {
    const ride = await this.rideRepository.findOne({
      where: { id: rideId },
      relations: { passenger: true, driver: { user: true } },
    });

    if (!ride) {
      throw new NotFoundException('Ride not found');
    }

    const cancellableStates = [RideStatus.REQUESTED, RideStatus.ACCEPTED, RideStatus.ARRIVED];
    if (!cancellableStates.includes(ride.status)) {
      throw new BadRequestException('Active rides cannot be cancelled after journey starts');
    }

    let cancelledBy = 'passenger';
    if (ride.driver && ride.driver.user.id === userId) {
      cancelledBy = 'driver';
    } else if (ride.passenger.id !== userId) {
      throw new ForbiddenException('You do not have permission to cancel this ride');
    }

    ride.status = RideStatus.CANCELLED;
    ride.cancellationReason = reason;
    ride.cancelledBy = cancelledBy;
    ride.cancelledAt = new Date();

    const updatedRide = await this.rideRepository.save(ride);

    // Notify counterpart
    if (cancelledBy === 'passenger' && ride.driver) {
      this.socketsGateway.notifyRideCancelledByOpponent(ride.driver.user.id, 'Passenger cancelled the ride.');
      await this.redisService.unlockDriver(ride.driver.id);
    } else if (cancelledBy === 'driver' && ride.driver) {
      this.socketsGateway.notifyRideCancelledByOpponent(ride.passenger.id, 'Driver cancelled the ride.');
      await this.redisService.unlockDriver(ride.driver.id);
    }

    return updatedRide;
  }

  async rateAndReviewRide(passengerId: string, rideId: string, dto: RateRideDto): Promise<Ride> {
    const ride = await this.rideRepository.findOne({
      where: { id: rideId, passenger: { id: passengerId } },
      relations: { driver: true },
    });

    if (!ride) {
      throw new NotFoundException('Completed ride not found');
    }

    if (ride.status !== RideStatus.COMPLETED) {
      throw new BadRequestException('Rides can only be rated after completion');
    }

    ride.rating = dto.rating;
    if (dto.review) ride.review = dto.review;

    const savedRide = await this.rideRepository.save(ride);

    // Recalculate Driver cumulative average rating
    if (ride.driver) {
      const driver = ride.driver;
      const ratings = await this.rideRepository.createQueryBuilder('ride')
        .select('AVG(ride.rating)', 'avg')
        .where('ride.driverId = :driverId', { driverId: driver.id })
        .andWhere('ride.rating IS NOT NULL')
        .getRawOne();

      driver.rating = parseFloat(parseFloat(ratings.avg || 5.0).toFixed(2));
      await this.driverRepository.save(driver);
    }

    return savedRide;
  }

  async getRideHistory(userId: string, role: 'passenger' | 'driver'): Promise<Ride[]> {
    if (role === 'passenger') {
      return this.rideRepository.find({
        where: { passenger: { id: userId } },
        relations: { driver: { user: true } },
        order: { createdAt: 'DESC' },
      });
    } else {
      return this.rideRepository.find({
        where: { driver: { user: { id: userId } } },
        relations: { passenger: true },
        order: { createdAt: 'DESC' },
      });
    }
  }
}
