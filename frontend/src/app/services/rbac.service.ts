import { Injectable, signal, inject, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../environments';
import { AuthService } from './auth.service';

export interface RbacRoleInfo {
  roleId: string;
  roleName: string;
  scope: string;
}

export interface RbacPermissionsResponse {
  permissions: string[];
  rbacRoles: RbacRoleInfo[];
}

@Injectable({ providedIn: 'root' })
export class RbacService {
  private readonly apiUrl = environment.apiUrl;
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  private permissions = signal<string[]>([]);
  private rbacRoles = signal<RbacRoleInfo[]>([]);
  private loaded = signal(false);
  private loading: Promise<void> | null = null;

  readonly hasAnyRole = computed(() => this.rbacRoles().length > 0);

  constructor() {
    if (this.auth.isAuthenticated()) {
      this.ensureLoaded();
    }
  }

  async ensureLoaded(): Promise<void> {
    if (this.loaded()) return;
    if (this.loading) return this.loading;
    this.loading = this.fetchPermissions();
    try {
      await this.loading;
    } finally {
      this.loading = null;
    }
  }

  private async fetchPermissions(): Promise<void> {
    try {
      const res = await firstValueFrom(
        this.http.get<RbacPermissionsResponse>(`${this.apiUrl}/rbac/me/permissions`),
      );
      this.permissions.set(res.permissions ?? []);
      this.rbacRoles.set(res.rbacRoles ?? []);
      this.loaded.set(true);
    } catch {
      this.permissions.set([]);
      this.rbacRoles.set([]);
      this.loaded.set(true);
    }
  }

  hasPermission(permission: string): boolean {
    return this.permissions().includes(permission);
  }

  hasAllPermissions(permissions: string[]): boolean {
    return permissions.every((p) => this.permissions().includes(p));
  }

  hasAnyPermission(permissions: string[]): boolean {
    return permissions.some((p) => this.permissions().includes(p));
  }

  hasRole(roleName: string): boolean {
    return this.rbacRoles().some((r) => r.roleName === roleName);
  }

  hasAnyOfRoles(roleNames: string[]): boolean {
    return roleNames.some((rn) => this.rbacRoles().some((r) => r.roleName === rn));
  }

  reset(): void {
    this.permissions.set([]);
    this.rbacRoles.set([]);
    this.loaded.set(false);
  }
}
