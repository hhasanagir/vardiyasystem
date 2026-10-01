import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ProcurementService } from './procurement.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { MinRole } from '../../guards/min-role';
import { CreateRequestDto } from './dto/create-request.dto';
import { CreateOrderDto } from './dto/create-order.dto';

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

@ApiTags('Procurement')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('procurement')
export class ProcurementController {
  constructor(private readonly procurementService: ProcurementService) {}

  @Get('requests')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'List procurement requests' })
  listRequests(
    @Query('status') status?: string,
    @Query('departmentId') departmentId?: string,
  ) {
    return this.procurementService.listRequests({ status, departmentId });
  }

  @Get('requests/:id')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Get procurement request by ID' })
  getRequest(@Param('id') id: string) {
    return this.procurementService.getRequest(id);
  }

  @Post('requests')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Create procurement request' })
  createRequest(@Body() dto: CreateRequestDto) {
    return this.procurementService.createRequest(dto);
  }

  @Post('requests/:id/approve')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Approve procurement request' })
  approveRequest(@Param('id') id: string, @Request() req: RequestWithUser) {
    return this.procurementService.approveRequest(id, req.user.id);
  }

  @Post('requests/:id/reject')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Reject procurement request' })
  rejectRequest(@Param('id') id: string, @Body('reason') reason: string) {
    return this.procurementService.rejectRequest(id, reason);
  }

  @Patch('requests/:id/status')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Update procurement request status' })
  updateRequestStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.procurementService.updateRequestStatus(id, status);
  }

  @Get('orders')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'List procurement orders' })
  listOrders(
    @Query('status') status?: string,
    @Query('supplierId') supplierId?: string,
  ) {
    return this.procurementService.listOrders({ status, supplierId });
  }

  @Get('orders/:id')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Get procurement order by ID' })
  getOrder(@Param('id') id: string) {
    return this.procurementService.getOrder(id);
  }

  @Post('orders')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Create procurement order' })
  createOrder(@Body() dto: CreateOrderDto) {
    return this.procurementService.createOrder(dto);
  }

  @Post('orders/:id/receive')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Receive procurement order' })
  receiveOrder(@Param('id') id: string) {
    return this.procurementService.receiveOrder(id);
  }

  @Patch('orders/:id/status')
  @Roles(MinRole.FIELD_SUPERVISOR)
  @ApiOperation({ summary: 'Update procurement order status' })
  updateOrderStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.procurementService.updateOrderStatus(id, status);
  }
}
