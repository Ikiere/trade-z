import { Module } from '@nestjs/common';
import { BrokerController } from './broker.controller';
import { BrokerService } from './broker.service';
import { PositionReconciliationService } from './position-reconciliation.service';

@Module({
  controllers: [BrokerController],
  providers: [BrokerService, PositionReconciliationService],
  exports: [BrokerService, PositionReconciliationService],
})
export class BrokerModule {}
