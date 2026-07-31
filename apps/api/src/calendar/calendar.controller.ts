import { Controller, Get } from '@nestjs/common';
import { CalendarService } from './calendar.service';

@Controller('calendar')
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @Get()
  async getEvents() {
    const events = await this.calendarService.getEvents();
    return {
      success: true,
      data: events,
      timestamp: new Date().toISOString(),
    };
  }
}
