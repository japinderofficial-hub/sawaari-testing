import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as jwt from 'jsonwebtoken';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { User, UserRole } from '../users/entities/user.entity';

@Injectable()
export class AuthService {
  private firebaseAdminInitialized = false;

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private configService: ConfigService
  ) {
    this.initializeFirebase();
  }

  private initializeFirebase() {
    try {
      const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');
      const clientEmail = this.configService.get<string>('FIREBASE_CLIENT_EMAIL');
      const privateKey = this.configService.get<string>('FIREBASE_PRIVATE_KEY');

      if (projectId) {
        let credential: any;
        if (clientEmail && privateKey) {
          const formattedPrivateKey = privateKey.replace(/\\n/g, '\n');
          const admin = require('firebase-admin');
          credential = admin.credential.cert({
            projectId,
            clientEmail,
            privateKey: formattedPrivateKey,
          });
        } else {
          credential = applicationDefault();
        }

        initializeApp({
          credential,
          projectId,
        });
        this.firebaseAdminInitialized = true;
      }
    } catch (e) {
      // Catch initialization issues in dev/test environment
    }
  }

  async verifyFirebaseTokenAndGetOrCreateUser(idToken: string, role?: UserRole, name?: string): Promise<{ user: User; token: string }> {
    let firebaseUid: string;
    let phone: string;
    let displayName = name || 'User';

    const isProduction = this.configService.get<string>('NODE_ENV') === 'production';
    const devBypass = this.configService.get<string>('DEV_BYPASS') === 'true' || this.configService.get<string>('NEXT_PUBLIC_DEV_BYPASS') === 'true';
    const allowMock = !isProduction && devBypass;

    // Mock bypass for testing/development
    if (idToken.startsWith('mock-token-')) {
      if (!allowMock) {
        throw new UnauthorizedException('Mock token is not allowed in production or when dev bypass is disabled');
      }
      const mockSuffix = idToken.replace('mock-token-', ''); // e.g. "passenger1", "driver1"
      firebaseUid = `uid-${mockSuffix}`;
      
      const phoneDigits = mockSuffix.match(/\d+/)?.[0];
      if (phoneDigits) {
        phone = `+91${phoneDigits}`;
      } else {
        phone = mockSuffix.includes('driver') ? `+919999999901` : `+919999999902`;
      }

      displayName = name || (mockSuffix.includes('driver') ? 'Ramu Auto' : 'Amit (Passenger)');
      if (mockSuffix.includes('admin')) {
        role = UserRole.ADMIN;
        phone = `+919999999999`;
        displayName = 'Super Admin';
      }
    } else if (this.firebaseAdminInitialized) {
      try {
        const decodedToken = await getAuth().verifyIdToken(idToken);
        firebaseUid = decodedToken.uid;
        phone = decodedToken.phone_number || '';
        displayName = name || decodedToken.name || 'User';
      } catch (error) {
        throw new UnauthorizedException('Invalid Firebase authentication token');
      }
    } else {
      throw new UnauthorizedException('Firebase Admin is not initialized and mock bypass is disabled');
    }

    // Check if user exists
    let user = await this.userRepository.findOne({ 
      where: { firebaseUid },
      relations: { driverProfile: true },
    });
    if (!user) {
      user = this.userRepository.create({
        firebaseUid,
        phone,
        name: displayName,
        role: role || UserRole.PASSENGER,
      });
      user = await this.userRepository.save(user);
    } else if (role && user.role !== role && user.role !== UserRole.ADMIN) {
      // Update role if explicitly changing view / logging in with different mode
      user.role = role;
      user = await this.userRepository.save(user);
    }

    // Generate backend JWT
    const jwtSecret = this.configService.get<string>('JWT_SECRET', 'sawaari_super_secret_jwt_key_2026');
    const token = jwt.sign(
      {
        id: user.id,
        phone: user.phone,
        role: user.role,
      },
      jwtSecret,
      { expiresIn: '30d' } // Persistent session - onboard appears once
    );

    return { user, token };
  }

  verifyJwt(token: string): any {
    const jwtSecret = this.configService.get<string>('JWT_SECRET', 'sawaari_super_secret_jwt_key_2026');
    try {
      return jwt.verify(token, jwtSecret);
    } catch (e) {
      throw new UnauthorizedException('Invalid JWT session token');
    }
  }
}
