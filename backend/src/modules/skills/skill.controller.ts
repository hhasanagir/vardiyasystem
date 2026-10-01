import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { MinRole } from '../../guards/min-role';
import { Log } from '../audit-log/log.decorator';
import { SkillService } from './skill.service';
import { CreateSkillDto } from './dto/create-skill.dto';
import { AssignSkillDto } from './dto/assign-skill.dto';

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

@ApiTags('skills')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('skills')
export class SkillController {
  constructor(private skillService: SkillService) {}

  @Post()
  @Roles(MinRole.HEAD_TECHNICIAN)
  @Log({
    action: 'SKILL_CREATED',
    entityType: 'skill',
    description: 'Yetenek oluşturuldu',
  })
  @ApiOperation({ summary: 'Create a new skill' })
  createSkill(@Body() dto: CreateSkillDto) {
    return this.skillService.createSkill(dto);
  }

  @Get()
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get all skills' })
  getAllSkills() {
    return this.skillService.getAllSkills();
  }

  @Get(':id')
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get skill by id' })
  getSkill(@Param('id') id: string) {
    return this.skillService.getSkill(id);
  }

  @Delete(':id')
  @Roles(MinRole.ADMIN)
  @Log({
    action: 'SKILL_DELETED',
    entityType: 'skill',
    description: 'Yetenek silindi',
  })
  @ApiOperation({ summary: 'Delete a skill' })
  deleteSkill(@Param('id') id: string) {
    return this.skillService.deleteSkill(id);
  }

  @Get('matrix/all')
  @Roles(MinRole.HEAD_TECHNICIAN)
  @ApiOperation({ summary: 'Get skill matrix (personnel x skills)' })
  @ApiQuery({ name: 'unitId', required: false })
  getSkillMatrix(@Query('unitId') unitId?: string) {
    return this.skillService.getSkillMatrix({ unitId });
  }

  @Get('expiring')
  @Roles(MinRole.HEAD_TECHNICIAN)
  @ApiOperation({ summary: 'Get expiring certifications' })
  @ApiQuery({ name: 'days', required: false, type: Number })
  getExpiring(@Query('days') days?: number) {
    return this.skillService.getExpiringCertifications(days || 30);
  }

  @Post('personnel/:personnelId')
  @Roles(MinRole.HEAD_TECHNICIAN)
  @Log({
    action: 'SKILL_ASSIGNED',
    entityType: 'personnel_skill',
    description: 'Yeteneğin personele atanması',
  })
  @ApiOperation({ summary: 'Assign skill to personnel' })
  assignSkill(
    @Param('personnelId') personnelId: string,
    @Body() dto: AssignSkillDto,
  ) {
    return this.skillService.assignSkill(personnelId, dto);
  }

  @Get('personnel/:personnelId')
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get personnel skills' })
  getPersonnelSkills(@Param('personnelId') personnelId: string) {
    return this.skillService.getPersonnelSkills(personnelId);
  }

  @Patch('personnel-skill/:id')
  @Roles(MinRole.HEAD_TECHNICIAN)
  @Log({
    action: 'PERSONNEL_SKILL_UPDATED',
    entityType: 'personnel_skill',
    description: 'Personel yeteneği güncellendi',
  })
  @ApiOperation({ summary: 'Update personnel skill (level, expiry)' })
  updatePersonnelSkill(
    @Param('id') id: string,
    @Body() dto: Partial<AssignSkillDto>,
  ) {
    return this.skillService.updatePersonnelSkill(id, dto);
  }

  @Delete('personnel-skill/:id')
  @Roles(MinRole.HEAD_TECHNICIAN)
  @Log({
    action: 'PERSONNEL_SKILL_REMOVED',
    entityType: 'personnel_skill',
    description: 'Personel yeteneği kaldırıldı',
  })
  @ApiOperation({ summary: 'Remove personnel skill' })
  removePersonnelSkill(@Param('id') id: string) {
    return this.skillService.removePersonnelSkill(id);
  }

  @Get('validate/schedule/:scheduleId')
  @Roles(MinRole.HEAD_TECHNICIAN)
  @ApiOperation({ summary: 'Validate all assignments have required skills' })
  validateSchedule(@Param('scheduleId') scheduleId: string) {
    return this.skillService.validateAssignments(scheduleId);
  }
}
