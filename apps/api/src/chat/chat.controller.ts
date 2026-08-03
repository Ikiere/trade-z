import { Controller, Post, Body, HttpCode, HttpStatus, Headers, UnauthorizedException } from '@nestjs/common';
import { ChatService } from './chat.service';
import { IsString, IsOptional } from 'class-validator';

export class AnalysisDto {
  @IsString()
  pair!: string;

  @IsString()
  @IsOptional()
  timeframe?: string;
}

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
  async getAnalysis(
    @Headers('authorization') auth: string,
    @Body() body: AnalysisDto,
  ) {
    const userId = this.extractUserId(auth);
    if (!userId) throw new UnauthorizedException('Valid session token required');

    const result = await this.chatService.getQuickAnalysis(userId, body.pair, body.timeframe || '4h');
    return result;
  }

  /**
   * Decode the Supabase JWT and return the real user UUID.
   */
  private extractUserId(authHeader: string): string | null {
    const token = authHeader?.replace('Bearer ', '').trim();
    if (!token || token === 'undefined' || token === 'null') return null;

    try {
      const payloadBase64 = token.split('.')[1];
      if (!payloadBase64) return null;

      const base64 = payloadBase64.replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(
        Buffer.from(base64, 'base64').toString('utf-8'),
      );

      const sub = payload?.sub;
      if (!sub || typeof sub !== 'string') return null;

      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(sub)) return null;

      return sub;
    } catch (e: any) {
      console.error('[chat.controller] JWT decode error:', e.message);
      return null;
    }
  }
}
