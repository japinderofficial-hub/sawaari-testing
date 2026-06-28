import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Authorization header is missing or invalid');
    }
    const token = authHeader.split(' ')[1];
    try {
      const payload = this.authService.verifyJwt(token);
      request.user = payload;
      return true;
    } catch (e) {
      throw new UnauthorizedException('Invalid JWT session token');
    }
  }
}
