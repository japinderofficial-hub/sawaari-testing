import { Controller, Get, Post, Body, Param, UseGuards, Request, Query } from '@nestjs/common';
import { RidesService } from './rides.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateRideDto } from './dto/create-ride.dto';
import { RateRideDto } from './dto/rate-ride.dto';

@Controller('rides')
@UseGuards(JwtAuthGuard)
export class RidesController {
  constructor(private readonly ridesService: RidesService) {}

  @Post('estimate')
  async getEstimate(@Body() body: { pickup: { lat: number; lng: number }; dropoff: { lat: number; lng: number } }) {
    return this.ridesService.getEstimate(body.pickup, body.dropoff);
  }

  @Post('request')
  async requestRide(@Request() req: any, @Body() dto: CreateRideDto) {
    return this.ridesService.requestRide(req.user.id, dto);
  }

  @Get('active')
  async getActiveRide(@Request() req: any) {
    return this.ridesService.getActiveRideForUser(req.user.id, req.user.role);
  }

  @Post(':id/accept')
  async acceptRide(@Request() req: any, @Param('id') id: string) {
    return this.ridesService.acceptRide(req.user.id, id);
  }

  @Post(':id/arrive')
  async arriveAtPickup(@Request() req: any, @Param('id') id: string) {
    return this.ridesService.driverArrivedAtPickup(req.user.id, id);
  }

  @Post(':id/start')
  async startRide(@Request() req: any, @Param('id') id: string, @Body('otp') otp: string) {
    return this.ridesService.startRide(req.user.id, id, otp);
  }

  @Post(':id/complete')
  async completeRide(@Request() req: any, @Param('id') id: string) {
    return this.ridesService.completeRide(req.user.id, id);
  }

  @Post(':id/cancel')
  async cancelRide(@Request() req: any, @Param('id') id: string, @Body('reason') reason: string) {
    return this.ridesService.cancelRide(req.user.id, id, reason || 'Cancelled by user');
  }

  @Post(':id/rate')
  async rateRide(@Request() req: any, @Param('id') id: string, @Body() dto: RateRideDto) {
    return this.ridesService.rateAndReviewRide(req.user.id, id, dto);
  }

  @Get('history')
  async getHistory(@Request() req: any) {
    return this.ridesService.getRideHistory(req.user.id, req.user.role);
  }
}
