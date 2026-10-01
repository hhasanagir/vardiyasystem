import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SwapRequestsService } from './swap-requests.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Log } from '../audit-log/log.decorator';

interface RequestWithUser {
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    organizationId?: string;
    unitId?: string;
  };
}

@ApiTags('swap-requests')
@Controller('swap-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class SwapRequestsController {
  constructor(private swapRequestsService: SwapRequestsService) {}

  @Get()
  @Roles(
    'hospital_admin',
    'supervisor',
    'senior_technician',
    'medical_engineer',
  )
  @ApiOperation({ summary: 'Get all swap requests' })
  findAll(@Request() req: RequestWithUser) {
    return this.swapRequestsService.findAll({
      unitId: req.user.unitId,
    });
  }

  @Get(':id')
  @Roles(
    'hospital_admin',
    'supervisor',
    'senior_technician',
    'medical_engineer',
  )
  @ApiOperation({ summary: 'Get swap request by ID' })
  findOne(@Param('id') id: string) {
    return this.swapRequestsService.findOne(id);
  }

  @Post()
  @Roles(
    'hospital_admin',
    'supervisor',
    'senior_technician',
    'medical_engineer',
    'technician',
    'assistant_technician',
  )
  @Log({
    action: 'SWAP_REQUEST_CREATED',
    entityType: 'swap_request',
    description: 'Takas talebi oluşturuldu',
  })
  @ApiOperation({ summary: 'Create swap request' })
  create(
    @Request() req: RequestWithUser,
    @Body()
    data: {
      fromAssignmentId: string;
      targetPersonnelId?: string;
      toAssignmentId?: string;
      reason?: string;
    },
  ) {
    return this.swapRequestsService.create({
      ...data,
      requesterId: req.user.id,
      organizationId: req.user.organizationId || '',
      unitId: req.user.unitId || '',
    });
  }

  @Patch(':id/approve')
  @UseGuards(RolesGuard)
  @Roles('hospital_admin', 'supervisor', 'senior_technician')
  @Log({
    action: 'SWAP_REQUEST_APPROVED',
    entityType: 'swap_request',
    description: 'Takas talebi onaylandı',
  })
  @ApiOperation({ summary: 'Approve swap request' })
  approve(@Param('id') id: string, @Request() req: RequestWithUser) {
    return this.swapRequestsService.approve(id, req.user.id);
  }

  @Patch(':id/reject')
  @UseGuards(RolesGuard)
  @Roles('hospital_admin', 'supervisor', 'senior_technician')
  @Log({
    action: 'SWAP_REQUEST_REJECTED',
    entityType: 'swap_request',
    description: 'Takas talebi reddedildi',
  })
  @ApiOperation({ summary: 'Reject swap request' })
  reject(@Param('id') id: string, @Request() req: RequestWithUser) {
    return this.swapRequestsService.reject(id, req.user.id);
  }

  @Delete(':id')
  @Roles(
    'hospital_admin',
    'supervisor',
    'senior_technician',
    'medical_engineer',
    'technician',
    'assistant_technician',
  )
  @Log({
    action: 'SWAP_REQUEST_DELETED',
    entityType: 'swap_request',
    description: 'Takas talebi silindi',
  })
  @ApiOperation({ summary: 'Delete swap request' })
  delete(@Param('id') id: string, @Request() req: RequestWithUser) {
    return this.swapRequestsService.delete(id, req.user.id);
  }
}
