import { Controller, Get, Post, Param, Body, UseGuards, Request } from '@nestjs/common';
import { SosService } from './sos.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { CreateSosDto } from './dto/create-sos.dto';
import { ResolveSosDto } from './dto/resolve-sos.dto';

@Controller('sos')
@UseGuards(JwtAuthGuard)
export class SosController {
  constructor(private readonly sosService: SosService) {}

  @Post('trigger')
  async trigger(@Request() req: any, @Body() dto: CreateSosDto) {
    return this.sosService.triggerSos(req.user.id, dto);
  }

  @Get('active')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async getActive(@Request() req: any) {
    return this.sosService.getActiveAlerts(req.user.id);
  }

  @Post(':id/resolve')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async resolve(@Request() req: any, @Param('id') id: string, @Body() dto: ResolveSosDto) {
    return this.sosService.resolveSos(req.user.id, id, dto);
  }
}
