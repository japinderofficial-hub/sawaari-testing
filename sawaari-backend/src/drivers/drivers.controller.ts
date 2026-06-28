import { Controller, Get, Post, Put, Body, UseGuards, Request, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DriversService } from './drivers.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { RegisterDriverDto } from './dto/register-driver.dto';
import { UploadDocumentDto } from './dto/upload-document.dto';

@Controller('drivers')
@UseGuards(JwtAuthGuard)
export class DriversController {
  constructor(private readonly driversService: DriversService) {}

  @Post('register')
  async register(@Request() req: any, @Body() dto: RegisterDriverDto) {
    return this.driversService.registerDriver(req.user.id, dto);
  }

  @Get('profile')
  async getProfile(@Request() req: any) {
    return this.driversService.getProfile(req.user.id);
  }

  @Put('status')
  @UseGuards(RolesGuard)
  @Roles(UserRole.DRIVER)
  async toggleStatus(@Request() req: any, @Body('isOnline') isOnline: boolean) {
    return this.driversService.toggleOnlineStatus(req.user.id, isOnline);
  }

  @Post('documents')
  @UseGuards(RolesGuard)
  @Roles(UserRole.DRIVER)
  async uploadDoc(@Request() req: any, @Body() dto: UploadDocumentDto) {
    return this.driversService.uploadDocument(req.user.id, dto);
  }

  @Post('documents/upload')
  @UseGuards(RolesGuard)
  @Roles(UserRole.DRIVER)
  @UseInterceptors(FileInterceptor('file'))
  async uploadDocFile(@Request() req: any, @UploadedFile() file: any) {
    return this.driversService.uploadDocumentToCloudinary(req.user.id, file);
  }

  @Get('documents')
  @UseGuards(RolesGuard)
  @Roles(UserRole.DRIVER)
  async getDocs(@Request() req: any) {
    return this.driversService.getDocuments(req.user.id);
  }
}
