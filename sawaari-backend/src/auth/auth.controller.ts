import { Controller, Post, Body, Headers, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UserRole } from '../users/entities/user.entity';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register-or-login')
  async registerOrLogin(
    @Headers('authorization') authHeader: string,
    @Body() body: { role: UserRole; name?: string }
  ) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    const token = authHeader.substring(7); // Remove 'Bearer '
    return this.authService.verifyFirebaseTokenAndGetOrCreateUser(token, body.role, body.name);
  }
}
