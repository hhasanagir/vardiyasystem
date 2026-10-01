import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../core/api/api.service';

export interface Skill {
  id: string;
  name: string;
  category: string;
  description: string | null;
  isActive: boolean;
  _count?: { personnelSkills: number };
}

export interface PersonnelSkillAssignment {
  id: string;
  personnelId: string;
  skillId: string;
  certificationLevel: string;
  expiresAt: string | null;
  certifiedAt: string | null;
  isActive: boolean;
  skill: Skill;
  personnel?: { id: string; name: string; role: string; unitId: string };
}

export interface SkillMatrixResponse {
  personnel: Array<{ id: string; name: string; role: string; unitId: string }>;
  skills: Skill[];
  assignments: Array<{
    id: string;
    personnelId: string;
    skillId: string;
    certificationLevel: string;
    expiresAt: string | null;
    certifiedAt: string | null;
    isActive: boolean;
  }>;
}

export interface ExpiringCertification {
  id: string;
  personnelId: string;
  skillId: string;
  certificationLevel: string;
  expiresAt: string;
  certifiedAt: string | null;
  isActive: boolean;
  personnel: { id: string; name: string; role: string };
  skill: Skill;
}

export interface CreateSkillPayload {
  name: string;
  category?: string;
  description?: string;
}

export interface AssignSkillPayload {
  skillId: string;
  certificationLevel?: string;
  certifiedAt?: string;
  expiresAt?: string;
}

@Injectable({ providedIn: 'root' })
export class SkillService {
  private api = inject(ApiService);

  getAllSkills(): Observable<Skill[]> {
    return this.api.get<Skill[]>('/skills');
  }

  createSkill(dto: CreateSkillPayload): Observable<Skill> {
    return this.api.post<Skill>('/skills', dto);
  }

  deleteSkill(id: string): Observable<any> {
    return this.api.delete(`/skills/${id}`);
  }

  getSkillMatrix(unitId?: string): Observable<SkillMatrixResponse> {
    const params: any = {};
    if (unitId) params.unitId = unitId;
    return this.api.get<SkillMatrixResponse>('/skills/matrix/all', { params });
  }

  getExpiringCertifications(days = 30): Observable<ExpiringCertification[]> {
    return this.api.get<ExpiringCertification[]>(`/skills/expiring?days=${days}`);
  }

  assignSkill(personnelId: string, dto: AssignSkillPayload): Observable<PersonnelSkillAssignment> {
    return this.api.post<PersonnelSkillAssignment>(`/skills/personnel/${personnelId}`, dto);
  }

  getPersonnelSkills(personnelId: string): Observable<PersonnelSkillAssignment[]> {
    return this.api.get<PersonnelSkillAssignment[]>(`/skills/personnel/${personnelId}`);
  }

  updatePersonnelSkill(
    id: string,
    dto: Partial<AssignSkillPayload>,
  ): Observable<PersonnelSkillAssignment> {
    return this.api.patch<PersonnelSkillAssignment>(`/skills/personnel-skill/${id}`, dto);
  }

  removePersonnelSkill(id: string): Observable<any> {
    return this.api.delete(`/skills/personnel-skill/${id}`);
  }
}
