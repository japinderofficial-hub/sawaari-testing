import { Controller, Get, Post, Put, Body, Param, UseGuards, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { User, UserRole } from '../users/entities/user.entity';
import { Driver, DriverStatus } from '../drivers/entities/driver.entity';
import { DriverDocument, DocumentStatus } from '../drivers/entities/driver-document.entity';
import { Ride, RideStatus } from '../rides/entities/ride.entity';
import { ReviewDocumentDto } from './dto/review-document.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(
    @InjectRepository(Driver)
    private driverRepository: Repository<Driver>,
    @InjectRepository(DriverDocument)
    private documentRepository: Repository<DriverDocument>,
    @InjectRepository(Ride)
    private rideRepository: Repository<Ride>
  ) {}

  @Get('drivers/pending')
  async getPendingDrivers() {
    // Return drivers who have pending documents or are pending approval
    return this.driverRepository.find({
      relations: { user: true, documents: true },
      order: { createdAt: 'DESC' },
    });
  }

  @Post('documents/:id/review')
  async reviewDocument(@Param('id') id: string, @Body() dto: ReviewDocumentDto) {
    const doc = await this.documentRepository.findOne({
      where: { id },
      relations: { driver: { user: true } },
    });

    if (!doc) {
      throw new NotFoundException('Document not found');
    }

    doc.status = dto.status;
    doc.comments = dto.comments || null;
    doc.reviewedAt = new Date();

    const savedDoc = await this.documentRepository.save(doc);

    // Automation: If status is approved, check if all 3 documents (License, Permit, Registration) are approved
    if (dto.status === DocumentStatus.APPROVED) {
      const driver = doc.driver;
      const allDocs = await this.documentRepository.find({
        where: { driver: { id: driver.id } },
      });

      const requiredTypes = ['license', 'permit', 'registration', 'aadhaar', 'vehicle_photo'];
      const approvedTypes = allDocs
        .filter((d) => d.status === DocumentStatus.APPROVED)
        .map((d) => d.type.toString());

      const hasAllApproved = requiredTypes.every((type) => approvedTypes.includes(type));
      if (hasAllApproved && driver.status === DriverStatus.PENDING_APPROVAL) {
        driver.status = DriverStatus.ACTIVE;
        await this.driverRepository.save(driver);
      }
    }

    return savedDoc;
  }

  @Put('drivers/:id/status')
  async updateDriverStatus(@Param('id') id: string, @Body('status') status: DriverStatus) {
    const driver = await this.driverRepository.findOne({
      where: { id },
      relations: { user: true },
    });

    if (!driver) {
      throw new NotFoundException('Driver profile not found');
    }

    if (!Object.values(DriverStatus).includes(status)) {
      throw new BadRequestException('Invalid driver status');
    }

    driver.status = status;
    return this.driverRepository.save(driver);
  }

  @Get('rides/active')
  async getActiveRides() {
    // Return all currently active rides in system
    return this.rideRepository.find({
      where: [
        { status: RideStatus.REQUESTED },
        { status: RideStatus.ACCEPTED },
        { status: RideStatus.ARRIVED },
        { status: RideStatus.IN_PROGRESS },
      ],
      relations: { passenger: true, driver: { user: true } },
      order: { createdAt: 'DESC' },
    });
  }
}
