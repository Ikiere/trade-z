import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';

@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('stats')
  async getPlatformStats() {
    const data = await this.adminService.getPlatformStats();
    return {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('signals')
  async getPlatformSignals() {
    const data = await this.adminService.getPlatformSignals();
    return {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };
  }
}
