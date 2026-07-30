import { Controller, Post, Body, Get, Headers, HttpCode, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(
    @Body() body: { email: string; password: string; fullName: string },
  ) {
    const data = await this.authService.signUp(body.email, body.password, body.fullName);
    return {
      success: true,
      data,
      message: 'Registration successful. Please check your email to verify.',
      timestamp: new Date().toISOString(),
    };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: { email: string; password: string }) {
    const data = await this.authService.signIn(body.email, body.password);
    return {
      success: true,
      data: {
        user: data.user,
        session: {
          accessToken: data.session?.access_token,
          refreshToken: data.session?.refresh_token,
          expiresAt: data.session?.expires_at,
        },
      },
      timestamp: new Date().toISOString(),
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Headers('authorization') auth: string) {
    const token = auth?.replace('Bearer ', '');
    if (!token) throw new UnauthorizedException('No token provided');
    await this.authService.signOut(token);
    return {
      success: true,
      message: 'Logged out successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('me')
  async me(@Headers('authorization') auth: string) {
    const token = auth?.replace('Bearer ', '');
    if (!token) throw new UnauthorizedException('No token provided');
    const user = await this.authService.getUser(token);
    return {
      success: true,
      data: user,
      timestamp: new Date().toISOString(),
    };
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() body: { email: string }) {
    await this.authService.resetPassword(body.email);
    return {
      success: true,
      message: 'If the email exists, a reset link has been sent.',
      timestamp: new Date().toISOString(),
    };
  }
}
