import { Controller, Get, Post, Body, Headers, UnauthorizedException } from '@nestjs/common';
import { BrokerService } from './broker.service';

@Controller('broker')
export class BrokerController {
  constructor(private readonly brokerService: BrokerService) {}

  @Get('connection')
  async getConnection(@Headers('authorization') auth: string) {
    const userId = this.extractUserId(auth);
    const data = await this.brokerService.getConnection(userId);
    return {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Post('connect')
  async connectBroker(
    @Headers('authorization') auth: string,
    @Body() body: { brokerName: string; accountNumber: string; accountType: string; leverage: number },
  ) {
    const userId = this.extractUserId(auth);
    const data = await this.brokerService.connectBroker(userId, body);
    return {
      success: true,
      data,
      message: 'Broker connection synchronized successfully',
      timestamp: new Date().toISOString(),
    };
  }

  private extractUserId(authHeader: string): string {
    const token = authHeader?.replace('Bearer ', '');
    if (!token && process.env.NODE_ENV === 'production') {
      throw new UnauthorizedException('Missing token');
    }
    return 'user-1';
  }
}
