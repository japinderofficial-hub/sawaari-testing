import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Driver, DriverStatus } from './entities/driver.entity';
import { DriverDocument, DocumentStatus } from './entities/driver-document.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { RegisterDriverDto } from './dto/register-driver.dto';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class DriversService {
  constructor(
    @InjectRepository(Driver)
    private driverRepository: Repository<Driver>,
    @InjectRepository(DriverDocument)
    private documentRepository: Repository<DriverDocument>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private redisService: RedisService,
    private configService: ConfigService
  ) {}

  async registerDriver(userId: string, dto: RegisterDriverDto): Promise<Driver> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const existing = await this.driverRepository.findOne({ where: { user: { id: userId } } });
    if (existing) {
      throw new BadRequestException('User is already registered as a driver');
    }

    // Force role to driver
    user.role = UserRole.DRIVER;
    await this.userRepository.save(user);

    // Auto-approve mock driver for development convenience
    const isProduction = this.configService.get<string>('NODE_ENV') === 'production';
    const devBypass = this.configService.get<string>('DEV_BYPASS') === 'true' || this.configService.get<string>('NEXT_PUBLIC_DEV_BYPASS') === 'true';
    const allowMock = !isProduction && devBypass;
    const isMock = allowMock && user.firebaseUid?.startsWith('uid-');

    const driver = this.driverRepository.create({
      vehicleNo: dto.vehicleNo.toUpperCase(),
      vehicleModel: dto.vehicleModel,
      aadhaarNo: dto.aadhaarNo,
      status: isMock ? DriverStatus.ACTIVE : DriverStatus.PENDING_APPROVAL,
      user,
    });

    return this.driverRepository.save(driver);
  }

  async getProfile(userId: string): Promise<Driver> {
    const driver = await this.driverRepository.findOne({
      where: { user: { id: userId } },
      relations: { user: true, documents: true },
    });
    if (!driver) {
      throw new NotFoundException('Driver profile not found. Please onboard first.');
    }

    // Auto-approve mock driver for development convenience if they are not active or documents are pending/missing
    const isProduction = this.configService.get<string>('NODE_ENV') === 'production';
    const devBypass = this.configService.get<string>('DEV_BYPASS') === 'true' || this.configService.get<string>('NEXT_PUBLIC_DEV_BYPASS') === 'true';
    const allowMock = !isProduction && devBypass;
    const isMock = allowMock && driver.user?.firebaseUid?.startsWith('uid-');

    if (isMock) {
      let needsSave = false;
      if (driver.status !== DriverStatus.ACTIVE) {
        driver.status = DriverStatus.ACTIVE;
        needsSave = true;
      }

      const requiredTypes = ['license', 'permit', 'registration', 'aadhaar', 'vehicle_photo'];
      const docs = driver.documents || [];

      for (const docType of requiredTypes) {
        let doc = docs.find((d) => d.type === docType);
        if (!doc) {
          doc = this.documentRepository.create({
            type: docType as any,
            url: 'https://res.cloudinary.com/demo/image/upload/v1580894568/sample.jpg',
            status: DocumentStatus.APPROVED,
            driver,
          });
          await this.documentRepository.save(doc);
          docs.push(doc);
          needsSave = true;
        } else if (doc.status !== DocumentStatus.APPROVED) {
          doc.status = DocumentStatus.APPROVED;
          await this.documentRepository.save(doc);
          needsSave = true;
        }
      }

      if (needsSave) {
        driver.documents = docs;
        await this.driverRepository.save(driver);
      }
    }

    return driver;
  }

  async uploadDocument(userId: string, dto: UploadDocumentDto): Promise<DriverDocument> {
    const driver = await this.getProfile(userId);

    // Auto-approve mock driver documents for testing
    const isProduction = this.configService.get<string>('NODE_ENV') === 'production';
    const devBypass = this.configService.get<string>('DEV_BYPASS') === 'true' || this.configService.get<string>('NEXT_PUBLIC_DEV_BYPASS') === 'true';
    const allowMock = !isProduction && devBypass;
    const isMock = allowMock && driver.user?.firebaseUid?.startsWith('uid-');
    const targetStatus = isMock ? DocumentStatus.APPROVED : DocumentStatus.PENDING;

    // If an existing document of the same type is already approved/pending, we replace it or update
    const existing = await this.documentRepository.findOne({
      where: { driver: { id: driver.id }, type: dto.type },
    });

    if (existing) {
      existing.url = dto.url;
      existing.status = targetStatus;
      existing.comments = null;
      existing.reviewedAt = null;
      return this.documentRepository.save(existing);
    }

    const doc = this.documentRepository.create({
      type: dto.type,
      url: dto.url,
      status: targetStatus,
      driver,
    });

    return this.documentRepository.save(doc);
  }

  async getDocuments(userId: string): Promise<DriverDocument[]> {
    const driver = await this.getProfile(userId);
    return this.documentRepository.find({ where: { driver: { id: driver.id } } });
  }

  async toggleOnlineStatus(userId: string, isOnline: boolean): Promise<Driver> {
    const driver = await this.getProfile(userId);

    if (isOnline) {
      // 1. Check if driver is approved
      if (driver.status !== DriverStatus.ACTIVE) {
        throw new ForbiddenException('Your driver profile is pending administrator approval or suspended.');
      }

      // 2. Check if all required documents (5 total) are approved
      const docs = await this.documentRepository.find({ where: { driver: { id: driver.id } } });
      const requiredTypes = ['license', 'permit', 'registration', 'aadhaar', 'vehicle_photo'];
      const approvedTypes = docs
        .filter((d) => d.status === DocumentStatus.APPROVED)
        .map((d) => d.type.toString());

      const hasAllApproved = requiredTypes.every((type) => approvedTypes.includes(type));
      if (!hasAllApproved) {
        throw new ForbiddenException(
          'All driver documents (License, Permit, Registration, Aadhaar, Vehicle Photo) must be uploaded and approved before going online.'
        );
      }

      driver.isOnline = true;
      driver.lastOnlineAt = new Date();
    } else {
      driver.isOnline = false;
      // Remove location from live Redis tracking cache
      await this.redisService.removeDriverLocation(driver.user.id);
    }

    return this.driverRepository.save(driver);
  }

  async uploadDocumentToCloudinary(userId: string, file: any): Promise<{ url: string }> {
    const driver = await this.getProfile(userId);
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException('File size exceeds 5MB limit');
    }

    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('Only image files are allowed');
    }

    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET');

    if (!cloudName || !apiKey || !apiSecret) {
      const devBypass = this.configService.get<string>('DEV_BYPASS') === 'true' || this.configService.get<string>('NEXT_PUBLIC_DEV_BYPASS') === 'true';
      if (devBypass) {
        console.warn('Cloudinary config missing. Returning mock upload URL.');
        return { url: 'https://res.cloudinary.com/demo/image/upload/v1580894568/sample.jpg' };
      }
      throw new BadRequestException('Cloudinary credentials are not configured on the server');
    }

    const cloudinary = require('cloudinary').v2;
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
    });

    try {
      const uploadResult = await new Promise<any>((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: 'sawaari_documents',
            public_id: `${driver.id}_${Date.now()}`,
          },
          (error: any, result: any) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        uploadStream.end(file.buffer);
      });

      return { url: uploadResult.secure_url };
    } catch (error) {
      console.error('Cloudinary upload error:', error);
      throw new BadRequestException('Failed to upload file to Cloudinary');
    }
  }
}
