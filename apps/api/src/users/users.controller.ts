import { Controller, Get, Put, Body, Param } from '@nestjs/common';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get(':userId/profile')
  async getProfile(@Param('userId') userId: string) {
    const profile = await this.usersService.getProfile(userId);
    return {
      success: true,
      data: profile,
      timestamp: new Date().toISOString(),
    };
  }

  @Put(':userId/profile')
  async updateProfile(
    @Param('userId') userId: string,
    @Body() body: Record<string, unknown>,
  ) {
    const profile = await this.usersService.updateProfile(userId, body);
    return {
      success: true,
      data: profile,
      timestamp: new Date().toISOString(),
    };
  }

  @Get(':userId/settings')
  async getSettings(@Param('userId') userId: string) {
    const settings = await this.usersService.getSettings(userId);
    return {
      success: true,
      data: settings,
      timestamp: new Date().toISOString(),
    };
  }

  @Put(':userId/settings')
  async updateSettings(
    @Param('userId') userId: string,
    @Body() body: Record<string, unknown>,
  ) {
    const settings = await this.usersService.updateSettings(userId, body);
    return {
      success: true,
      data: settings,
      timestamp: new Date().toISOString(),
    };
  }
}
