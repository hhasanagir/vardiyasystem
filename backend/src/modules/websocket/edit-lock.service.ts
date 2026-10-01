import { Injectable } from '@nestjs/common';

export interface EditLock {
  scheduleId: string;
  userId: string;
  userName: string;
  lockId: string;
  acquiredAt: Date;
  expiresAt: Date;
  entityId?: string;
  entityType?: string;
  isActive: boolean;
}

export interface LockResult {
  success: boolean;
  lockId?: string;
  expiresAt?: Date;
  reason?: string;
  lockedBy?: string;
  lockedByName?: string;
}

@Injectable()
export class EditLockService {
  private locks = new Map<string, EditLock>();
  private userLocks = new Map<string, Set<string>>();
  private readonly LOCK_DURATION_MS = 5 * 60 * 1000;
  private readonly LOCK_EXTENSION_MS = 2 * 60 * 1000;

  acquireLock(
    scheduleId: string,
    userId: string,
    userName: string,
    options?: { entityId?: string; entityType?: string },
  ): LockResult {
    const existingLock = this.locks.get(scheduleId);

    if (existingLock && existingLock.userId !== userId) {
      if (this.isLockExpired(existingLock)) {
        this.releaseLock(scheduleId, existingLock.userId);
      } else {
        return {
          success: false,
          reason: 'Schedule is locked by another user',
          lockedBy: existingLock.userId,
          lockedByName: existingLock.userName,
          expiresAt: existingLock.expiresAt,
        };
      }
    }

    const lockId = this.generateLockId();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.LOCK_DURATION_MS);

    const lock: EditLock = {
      scheduleId,
      userId,
      userName,
      lockId,
      acquiredAt: now,
      expiresAt,
      entityId: options?.entityId,
      entityType: options?.entityType,
      isActive: true,
    };

    this.locks.set(scheduleId, lock);

    if (!this.userLocks.has(userId)) {
      this.userLocks.set(userId, new Set());
    }
    this.userLocks.get(userId)!.add(scheduleId);

    return {
      success: true,
      lockId,
      expiresAt,
    };
  }

  releaseLock(scheduleId: string, userId: string): boolean {
    const lock = this.locks.get(scheduleId);

    if (!lock) return false;

    if (lock.userId !== userId) {
      return false;
    }

    lock.isActive = false;
    this.locks.delete(scheduleId);

    const userLockSet = this.userLocks.get(userId);
    if (userLockSet) {
      userLockSet.delete(scheduleId);
      if (userLockSet.size === 0) {
        this.userLocks.delete(userId);
      }
    }

    return true;
  }

  forceReleaseLock(scheduleId: string): void {
    const lock = this.locks.get(scheduleId);
    if (lock) {
      const userLockSet = this.userLocks.get(lock.userId);
      if (userLockSet) {
        userLockSet.delete(scheduleId);
        if (userLockSet.size === 0) {
          this.userLocks.delete(lock.userId);
        }
      }
      this.locks.delete(scheduleId);
    }
  }

  refreshLock(scheduleId: string, userId: string): boolean {
    const lock = this.locks.get(scheduleId);

    if (!lock || lock.userId !== userId) {
      return false;
    }

    const now = new Date();
    lock.expiresAt = new Date(now.getTime() + this.LOCK_DURATION_MS);
    lock.isActive = true;

    return true;
  }

  extendLock(scheduleId: string, userId: string): boolean {
    const lock = this.locks.get(scheduleId);

    if (!lock || lock.userId !== userId) {
      return false;
    }

    const newExpiresAt = new Date(
      lock.expiresAt.getTime() + this.LOCK_EXTENSION_MS,
    );
    lock.expiresAt = newExpiresAt;

    return true;
  }

  getScheduleLock(scheduleId: string): EditLock | null {
    const lock = this.locks.get(scheduleId);

    if (!lock) return null;

    if (this.isLockExpired(lock)) {
      this.forceReleaseLock(scheduleId);
      return null;
    }

    return lock;
  }

  getUserActiveLocks(userId: string): EditLock[] {
    const lockSet = this.userLocks.get(userId);
    if (!lockSet) return [];

    const activeLocks: EditLock[] = [];
    for (const scheduleId of lockSet) {
      const lock = this.locks.get(scheduleId);
      if (lock && !this.isLockExpired(lock)) {
        activeLocks.push(lock);
      }
    }
    return activeLocks;
  }

  getExpiredLocks(): EditLock[] {
    const now = new Date();
    const expired: EditLock[] = [];

    for (const lock of this.locks.values()) {
      if (lock.expiresAt < now) {
        expired.push(lock);
      }
    }

    return expired;
  }

  isScheduleLocked(scheduleId: string): boolean {
    const lock = this.locks.get(scheduleId);

    if (!lock) return false;

    if (this.isLockExpired(lock)) {
      this.forceReleaseLock(scheduleId);
      return false;
    }

    return true;
  }

  isLockedByUser(scheduleId: string, userId: string): boolean {
    const lock = this.locks.get(scheduleId);
    return lock?.userId === userId && !this.isLockExpired(lock);
  }

  getAllLocks(): EditLock[] {
    return Array.from(this.locks.values()).filter(
      (l) => !this.isLockExpired(l),
    );
  }

  private isLockExpired(lock: EditLock): boolean {
    return lock.expiresAt < new Date();
  }

  private generateLockId(): string {
    return `lock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
