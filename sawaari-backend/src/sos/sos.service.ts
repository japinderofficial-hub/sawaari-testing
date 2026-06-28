import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SosAlert, SosStatus } from './entities/sos-alert.entity';
import { Ride } from '../rides/entities/ride.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { CreateSosDto } from './dto/create-sos.dto';
import { ResolveSosDto } from './dto/resolve-sos.dto';

@Injectable()
export class SosService {
  private readonly logger = new Logger(SosService.name);

  constructor(
    @InjectRepository(SosAlert)
    private sosRepository: Repository<SosAlert>,
    @InjectRepository(Ride)
    private rideRepository: Repository<Ride>,
    @InjectRepository(User)
    private userRepository: Repository<User>
  ) {}

  async triggerSos(userId: string, dto: CreateSosDto): Promise<SosAlert> {
    const ride = await this.rideRepository.findOne({
      where: { id: dto.rideId },
      relations: { passenger: true, driver: { user: true } },
    });

    if (!ride) {
      throw new NotFoundException('Ride not found');
    }

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Reporter user not found');
    }

    let reporterRole = '';
    if (ride.passenger.id === userId) {
      reporterRole = 'passenger';
    } else if (ride.driver && ride.driver.user.id === userId) {
      reporterRole = 'driver';
    } else {
      throw new ForbiddenException('You are not associated with this ride to trigger SOS.');
    }

    const alert = this.sosRepository.create({
      ride,
      reporter: user,
      reporterRole,
      location: {
        type: 'Point',
        coordinates: [dto.longitude, dto.latitude],
      },
      status: SosStatus.ACTIVE,
    });

    const savedAlert = await this.sosRepository.save(alert);
    this.logger.error(`🚨 SOS ALERT TRIGGERED! Ride: ${ride.id}, User: ${user.name} (${reporterRole})`);

    return savedAlert;
  }

  async resolveSos(adminUserId: string, alertId: string, dto: ResolveSosDto): Promise<SosAlert> {
    const admin = await this.userRepository.findOne({ where: { id: adminUserId, role: UserRole.ADMIN } });
    if (!admin) {
      throw new ForbiddenException('Only administrators can resolve SOS alerts.');
    }

    const alert = await this.sosRepository.findOne({ where: { id: alertId } });
    if (!alert) {
      throw new NotFoundException('SOS alert not found');
    }

    if (alert.status === SosStatus.RESOLVED) {
      throw new BadRequestException('SOS alert is already resolved');
    }

    alert.status = SosStatus.RESOLVED;
    alert.resolvedBy = admin;
    alert.resolutionNotes = dto.notes;
    alert.resolvedAt = new Date();

    return this.sosRepository.save(alert);
  }

  async getActiveAlerts(adminUserId: string): Promise<SosAlert[]> {
    const admin = await this.userRepository.findOne({ where: { id: adminUserId, role: UserRole.ADMIN } });
    if (!admin) {
      throw new ForbiddenException('Only administrators can access SOS queues.');
    }

    return this.sosRepository.find({
      where: { status: SosStatus.ACTIVE },
      relations: {
        ride: { passenger: true, driver: { user: true } },
        reporter: true,
      },
      order: { createdAt: 'DESC' },
    });
  }
}
