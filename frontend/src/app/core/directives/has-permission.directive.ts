import {
  Directive,
  Input,
  TemplateRef,
  ViewContainerRef,
  OnInit,
  inject,
  OnDestroy,
  effect,
} from '@angular/core';
import { RbacService } from '../../services/rbac.service';

@Directive({
  selector: '[appHasPermission]',
  standalone: true,
})
export class HasPermissionDirective implements OnInit, OnDestroy {
  private templateRef = inject(TemplateRef<unknown>);
  private viewContainer = inject(ViewContainerRef);
  private rbac = inject(RbacService);
  private effectRef = effect(() => {
    const _signal = this.rbac['permissions']();
    if (this.mode === 'any') {
      const perms = this.currentPermission ? [this.currentPermission] : [];
      this.checkPermissions(perms);
    } else {
      this.checkPermission(this.currentPermission);
    }
  });

  private currentPermission = '';
  private mode: 'all' | 'any' = 'all';

  @Input() set appHasPermission(permission: string | string[]) {
    if (Array.isArray(permission)) {
      this.currentPermission = '';
      this.mode = 'any';
      this.checkPermissions(permission);
    } else {
      this.currentPermission = permission;
      this.mode = 'all';
      this.checkPermission(permission);
    }
  }

  ngOnInit() {}

  ngOnDestroy() {
    this.effectRef.destroy();
  }

  private checkPermission(permission: string): void {
    if (!permission) {
      this.viewContainer.createEmbeddedView(this.templateRef);
      return;
    }
    if (this.rbac.hasPermission(permission)) {
      if (this.viewContainer.length === 0) {
        this.viewContainer.createEmbeddedView(this.templateRef);
      }
    } else {
      this.viewContainer.clear();
    }
  }

  private checkPermissions(permissions: string[]): void {
    if (permissions.length === 0) {
      this.viewContainer.createEmbeddedView(this.templateRef);
      return;
    }
    const hasAccess =
      this.mode === 'any'
        ? this.rbac.hasAnyPermission(permissions)
        : this.rbac.hasAllPermissions(permissions);
    if (hasAccess) {
      if (this.viewContainer.length === 0) {
        this.viewContainer.createEmbeddedView(this.templateRef);
      }
    } else {
      this.viewContainer.clear();
    }
  }
}
