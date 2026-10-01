import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { MinRole } from '../../guards/min-role';
import { ShiftTasksService } from './shift-tasks.service';
import { UpdateTaskDto } from './dto/update-task.dto';

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

@ApiTags('shift-tasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('shift-tasks')
export class ShiftTasksController {
  constructor(private shiftTasksService: ShiftTasksService) {}

  @Get()
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get today tasks for current user' })
  getToday(@Request() req: RequestWithUser) {
    return this.shiftTasksService.getTodayTasks(req.user.id);
  }

  @Get(':date')
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get tasks for a specific date' })
  getByDate(@Request() req: RequestWithUser, @Param('date') date: string) {
    return this.shiftTasksService.getDefaultTasks(req.user.id, date);
  }

  @Get(':date/progress')
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get task progress for a date' })
  getProgress(@Request() req: RequestWithUser, @Param('date') date: string) {
    return this.shiftTasksService.getProgress(req.user.id, date);
  }

  @Patch(':taskId')
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Update task status' })
  updateStatus(
    @Request() req: RequestWithUser,
    @Param('taskId') taskId: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.shiftTasksService.updateTaskStatus(
      req.user.id,
      taskId,
      dto.status,
    );
  }
}
