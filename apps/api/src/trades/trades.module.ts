import { Module } from '@nestjs/common';
import { TradesController } from './trades.controller';
import { TradesService } from './trades.service';
import { RiskService } from './risk.service';
import { ExecutionService } from './execution.service';

@Module({
  controllers: [TradesController],
  providers: [TradesService, RiskService, ExecutionService],
  exports: [TradesService, ExecutionService],
})
export class TradesModule {}
