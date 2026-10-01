import { Injectable } from '@nestjs/common';

export interface CursorPosition {
  x?: number;
  y?: number;
  row?: number;
  col?: number;
  element?: string;
  [key: string]: unknown;
}

export interface UserPresence {
  userId: string;
  userName: string;
  role: string;
  organizationId: string;
  unitId?: string;
  socketId: string;
  isOnline: boolean;
  lastActivity: Date;
  currentScheduleId?: string;
  isTyping: boolean;
  cursorPosition?: CursorPosition;
}

export interface SchedulePresence {
  scheduleId: string;
  viewers: UserPresence[];
  viewerCount: number;
}

@Injectable()
export class PresenceService {
  private presenceMap = new Map<string, UserPresence>();
  private scheduleViewers = new Map<string, Set<string>>();

  setOnline(
    userId: string,
    data: {
      socketId: string;
      userName: string;
      role: string;
      organizationId: string;
      unitId?: string;
      lastActivity: Date;
    },
  ): void {
    const presence: UserPresence = {
      userId,
      userName: data.userName,
      role: data.role,
      organizationId: data.organizationId,
      unitId: data.unitId,
      socketId: data.socketId,
      isOnline: true,
      lastActivity: data.lastActivity,
      isTyping: false,
      cursorPosition: undefined,
    };
    this.presenceMap.set(userId, presence);
  }

  setOffline(userId: string): void {
    const presence = this.presenceMap.get(userId);
    if (presence) {
      presence.isOnline = false;
      presence.socketId = '';
      presence.currentScheduleId = undefined;
    }

    for (const [scheduleId, viewers] of this.scheduleViewers) {
      viewers.delete(userId);
    }
  }

  updateActivity(userId: string, scheduleId?: string): void {
    const presence = this.presenceMap.get(userId);
    if (presence) {
      presence.lastActivity = new Date();
      if (scheduleId) {
        presence.currentScheduleId = scheduleId;
      }
    }
  }

  setTyping(userId: string, isTyping: boolean): void {
    const presence = this.presenceMap.get(userId);
    if (presence) {
      presence.isTyping = isTyping;
    }
  }

  setCursorPosition(userId: string, position: CursorPosition): void {
    const presence = this.presenceMap.get(userId);
    if (presence) {
      presence.cursorPosition = position;
    }
  }

  addToSchedule(userId: string, scheduleId: string): void {
    if (!this.scheduleViewers.has(scheduleId)) {
      this.scheduleViewers.set(scheduleId, new Set());
    }
    this.scheduleViewers.get(scheduleId)!.add(userId);

    const presence = this.presenceMap.get(userId);
    if (presence) {
      presence.currentScheduleId = scheduleId;
    }
  }

  removeFromSchedule(userId: string, scheduleId: string): void {
    const viewers = this.scheduleViewers.get(scheduleId);
    if (viewers) {
      viewers.delete(userId);
    }

    const presence = this.presenceMap.get(userId);
    if (presence?.currentScheduleId === scheduleId) {
      presence.currentScheduleId = undefined;
    }
  }

  getUser(userId: string): UserPresence | undefined {
    return this.presenceMap.get(userId);
  }

  getAllUsers(): Map<string, UserPresence> {
    return new Map(this.presenceMap);
  }

  getOrganizationUsers(organizationId: string): UserPresence[] {
    return Array.from(this.presenceMap.values()).filter(
      (p) => p.organizationId === organizationId && p.isOnline,
    );
  }

  getScheduleViewers(scheduleId: string): UserPresence[] {
    const userIds = this.scheduleViewers.get(scheduleId);
    if (!userIds) return [];

    return Array.from(userIds)
      .map((id) => this.presenceMap.get(id))
      .filter((p): p is UserPresence => p !== undefined && p.isOnline);
  }

  getSchedulePresence(scheduleId: string): SchedulePresence {
    const viewers = this.getScheduleViewers(scheduleId);
    return {
      scheduleId,
      viewers,
      viewerCount: viewers.length,
    };
  }

  getOnlineCount(organizationId?: string): number {
    if (organizationId) {
      return this.getOrganizationUsers(organizationId).length;
    }
    return Array.from(this.presenceMap.values()).filter((p) => p.isOnline)
      .length;
  }

  isUserOnline(userId: string): boolean {
    const presence = this.presenceMap.get(userId);
    return presence?.isOnline ?? false;
  }

  getStaleUsers(thresholdMs: number): UserPresence[] {
    const now = Date.now();
    return Array.from(this.presenceMap.values()).filter(
      (p) => p.isOnline && now - p.lastActivity.getTime() > thresholdMs,
    );
  }
}
