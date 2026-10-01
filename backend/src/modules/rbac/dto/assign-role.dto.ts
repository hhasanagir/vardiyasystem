import { IsString, IsOptional, IsUUID } from 'class-validator';

export class AssignRoleDto {
  @IsUUID()
  @IsString()
  userId: string;

  @IsUUID()
  @IsString()
  roleId: string;

  @IsOptional()
  @IsUUID()
  @IsString()
  organizationId?: string;

  @IsOptional()
  @IsUUID()
  @IsString()
  hospitalGroupId?: string;

  @IsOptional()
  @IsUUID()
  @IsString()
  hospitalId?: string;

  @IsOptional()
  @IsUUID()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsUUID()
  @IsString()
  unitId?: string;
}

export class UpdateRolePermissionsDto {
  @IsString({ each: true })
  permissions: string[];
}
