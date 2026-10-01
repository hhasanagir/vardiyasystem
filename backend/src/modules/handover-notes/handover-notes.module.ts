import { Module } from '@nestjs/common';
import { HandoverNotesController } from './handover-notes.controller';
import { HandoverNotesService } from './handover-notes.service';
import { WebsocketModule } from '../websocket/websocket.module';

@Module({
  imports: [WebsocketModule],
  controllers: [HandoverNotesController],
  providers: [HandoverNotesService],
  exports: [HandoverNotesService],
})
export class HandoverNotesModule {}
