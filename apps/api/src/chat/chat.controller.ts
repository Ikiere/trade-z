import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ChatService } from './chat.service';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async query(@Body() body: { prompt: string }) {
    const reply = await this.chatService.sendQuery(body.prompt);
    return {
      success: true,
      data: { reply },
      timestamp: new Date().toISOString(),
    };
  }

  @Post('analysis')
  @HttpCode(HttpStatus.OK)
  async getAnalysis(@Body() body: { pair: string; timeframe?: string }) {
    const result = await this.chatService.getQuickAnalysis(body.pair, body.timeframe || '4h');
    return result;
  }
}
