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
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { PersonnelGroupsService } from './personnel-groups.service';
import { CreatePersonnelGroupDto } from './dto/create-personnel-group.dto';
import { UpdatePersonnelGroupDto } from './dto/update-personnel-group.dto';
import { CreateShiftTemplateDto } from './dto/create-shift-template.dto';
import { UpdateShiftTemplateDto } from './dto/update-shift-template.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { MinRole } from '../../guards/min-role';

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

@ApiTags('personnel-groups')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('personnel-groups')
export class PersonnelGroupsController {
  constructor(private personnelGroupsService: PersonnelGroupsService) {}

  @Get()
  @Roles(MinRole.VIEWER)
  @ApiOperation({
    summary: 'List personnel groups (cihaz dışı nöbet grupları)',
  })
  @ApiQuery({ name: 'unitId', required: false })
  findAll(@Request() req: RequestWithUser, @Query('unitId') unitId?: string) {
    return this.personnelGroupsService.findAll(req.user.organizationId, unitId);
  }

  @Get(':id')
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'Get a personnel group with templates and members' })
  findOne(@Param('id') id: string) {
    return this.personnelGroupsService.findOne(id);
  }

  @Post()
  @Roles(MinRole.SUPERVISOR)
  @ApiOperation({ summary: 'Create a personnel group (yönetim rolü gerekli)' })
  create(
    @Body() dto: CreatePersonnelGroupDto,
    @Request() req: RequestWithUser,
  ) {
    return this.personnelGroupsService.create(
      dto,
      req.user.organizationId,
      req.user.id,
    );
  }

  @Patch(':id')
  @Roles(MinRole.SUPERVISOR)
  @ApiOperation({ summary: 'Update a personnel group' })
  update(@Param('id') id: string, @Body() dto: UpdatePersonnelGroupDto) {
    return this.personnelGroupsService.update(id, dto);
  }

  @Delete(':id')
  @Roles(MinRole.SUPERVISOR)
  @ApiOperation({ summary: 'Deactivate a personnel group (soft delete)' })
  remove(@Param('id') id: string) {
    return this.personnelGroupsService.remove(id);
  }

  @Get(':id/templates')
  @Roles(MinRole.VIEWER)
  @ApiOperation({ summary: 'List shift templates for a personnel group' })
  findTemplates(@Param('id') id: string) {
    return this.personnelGroupsService.findTemplates(id);
  }

  @Post(':id/templates')
  @Roles(MinRole.SUPERVISOR)
  @ApiOperation({ summary: 'Create a shift template for a personnel group' })
  createTemplate(
    @Param('id') id: string,
    @Body() dto: CreateShiftTemplateDto,
    @Request() req: RequestWithUser,
  ) {
    return this.personnelGroupsService.createTemplate(
      id,
      dto,
      req.user.organizationId,
    );
  }

  @Patch(':id/templates/:templateId')
  @Roles(MinRole.SUPERVISOR)
  @ApiOperation({ summary: 'Update a shift template' })
  updateTemplate(
    @Param('id') id: string,
    @Param('templateId') templateId: string,
    @Body() dto: UpdateShiftTemplateDto,
  ) {
    void id;
    return this.personnelGroupsService.updateTemplate(templateId, dto);
  }

  @Delete(':id/templates/:templateId')
  @Roles(MinRole.SUPERVISOR)
  @ApiOperation({ summary: 'Deactivate a shift template (soft delete)' })
  removeTemplate(
    @Param('id') id: string,
    @Param('templateId') templateId: string,
  ) {
    void id;
    return this.personnelGroupsService.removeTemplate(templateId);
  }
}
