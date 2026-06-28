import { Controller, Get, Put, Post, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { SaveLocationDto } from './dto/save-location.dto';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('profile')
  async getProfile(@Request() req: any) {
    return this.usersService.findById(req.user.id);
  }

  @Put('profile')
  async updateProfile(@Request() req: any, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(req.user.id, dto);
  }

  @Get('locations')
  async getSavedLocations(@Request() req: any) {
    return this.usersService.getSavedLocations(req.user.id);
  }

  @Post('locations')
  async saveLocation(@Request() req: any, @Body() dto: SaveLocationDto) {
    return this.usersService.saveLocation(req.user.id, dto);
  }

  @Delete('locations/:id')
  async deleteLocation(@Request() req: any, @Param('id') id: string) {
    await this.usersService.deleteSavedLocation(req.user.id, id);
    return { success: true };
  }
}
