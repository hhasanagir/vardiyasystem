import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DeviceLifecycleService } from './device-lifecycle.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { MinRole } from '../../guards/min-role';

@ApiTags('device-lifecycle')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('lifecycle')
export class DeviceLifecycleController {
  constructor(
    private readonly deviceLifecycleService: DeviceLifecycleService,
  ) {}

  @Get()
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'List lifecycle events' })
  findAll(
    @Query('assetId') assetId?: string,
    @Query('eventType') eventType?: string,
  ) {
    return this.deviceLifecycleService.findAll(assetId, eventType);
  }

  @Get('asset/:assetId')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Get lifecycle events by asset' })
  getByAsset(@Param('assetId') assetId: string) {
    return this.deviceLifecycleService.getByAsset(assetId);
  }

  @Get(':id')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Get a lifecycle event by ID' })
  findOne(@Param('id') id: string) {
    return this.deviceLifecycleService.findById(id);
  }

  @Post()
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Create a lifecycle event' })
  create(
    @Body()
    body: {
      assetId: string;
      eventType: string;
      eventDate: Date | string;
      title: string;
      completedDate?: Date | string;
      description?: string;
      performedById?: string;
      referenceNumber?: string;
      referenceType?: string;
      locationFrom?: string;
      locationTo?: string;
      documents?: string;
      notes?: string;
    },
  ) {
    return this.deviceLifecycleService.create(body);
  }

  @Patch(':id')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Update a lifecycle event' })
  update(@Param('id') id: string, @Body() body: Record<string, any>) {
    return this.deviceLifecycleService.update(id, body);
  }

  @Delete(':id')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Delete a lifecycle event' })
  remove(@Param('id') id: string) {
    return this.deviceLifecycleService.remove(id);
  }
}
