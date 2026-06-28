import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { User } from './entities/user.entity';
import { SavedLocation } from './entities/saved-location.entity';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { SaveLocationDto } from './dto/save-location.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(SavedLocation)
    private savedLocationRepository: Repository<SavedLocation>,
    private configService: ConfigService
  ) {}

  async findById(id: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: { driverProfile: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async updateProfile(id: string, dto: UpdateProfileDto): Promise<User> {
    const user = await this.findById(id);
    if (dto.name !== undefined) user.name = dto.name;
    if (dto.email !== undefined) user.email = dto.email;
    if (dto.fcmToken !== undefined) user.fcmToken = dto.fcmToken;
    return this.userRepository.save(user);
  }

  async getSavedLocations(userId: string): Promise<SavedLocation[]> {
    return this.savedLocationRepository.find({
      where: { user: { id: userId } },
      order: { createdAt: 'DESC' },
    });
  }

  async geocodeAddress(address: string): Promise<{ latitude: number; longitude: number }> {
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&countrycodes=in`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Sawaari-App/1.0',
        }
      });
      if (!response.ok) throw new Error(`Nominatim response not ok: ${response.statusText}`);
      const data = await response.json();
      if (data && data.length > 0) {
        return {
          latitude: parseFloat(data[0].lat),
          longitude: parseFloat(data[0].lon),
        };
      } else {
        console.warn('Nominatim returned empty results for address:', address);
      }
    } catch (e) {
      console.error('Nominatim Geocoding request failed:', e);
    }

    return { latitude: 12.9716, longitude: 77.5946 };
  }

  async saveLocation(userId: string, dto: SaveLocationDto): Promise<SavedLocation> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    let lat = dto.latitude;
    let lng = dto.longitude;

    if (lat === 12.9716 && lng === 77.5946) {
      const coords = await this.geocodeAddress(dto.address);
      lat = coords.latitude;
      lng = coords.longitude;
    }

    // If it's Home or Work, let's upsert to prevent duplicates of the same type
    if (dto.type === 'home' || dto.type === 'work') {
      const existing = await this.savedLocationRepository.findOne({
        where: { user: { id: userId }, type: dto.type },
      });
      if (existing) {
        existing.name = dto.name;
        existing.address = dto.address;
        existing.location = {
          type: 'Point',
          coordinates: [lng, lat],
        };
        return this.savedLocationRepository.save(existing);
      }
    }

    const savedLoc = this.savedLocationRepository.create({
      name: dto.name,
      type: dto.type,
      address: dto.address,
      location: {
        type: 'Point',
        coordinates: [lng, lat],
      },
      user,
    });

    return this.savedLocationRepository.save(savedLoc);
  }

  async deleteSavedLocation(userId: string, locationId: string): Promise<void> {
    const result = await this.savedLocationRepository.delete({
      id: locationId,
      user: { id: userId },
    });
    if (result.affected === 0) {
      throw new NotFoundException('Saved location not found');
    }
  }
}
