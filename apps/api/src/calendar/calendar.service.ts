import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CalendarService {
  private aiServiceUrl: string;

  constructor(private configService: ConfigService) {
    this.aiServiceUrl = this.configService.get<string>('AI_SERVICE_URL') || 'http://localhost:8000';
  }

  async getEvents(): Promise<any> {
    try {
      const response = await fetch(`${this.aiServiceUrl}/api/v1/analysis/calendar`);
      if (!response.ok) {
        throw new Error('Failed to fetch from AI calendar');
      }
      const result = (await response.json()) as any;
      return result?.data || [];
    } catch (error: any) {
      console.error('Error in NestJS CalendarService:', error.message);
      return [];
    }
  }
}
