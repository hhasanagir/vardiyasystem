export enum AuditEvent {
  // Auth
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  FAILED_LOGIN = 'FAILED_LOGIN',
  PASSWORD_CHANGE = 'PASSWORD_CHANGE',
  TOKEN_REFRESH = 'TOKEN_REFRESH',

  // Security (F31)
  ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',
  ACCOUNT_UNLOCKED = 'ACCOUNT_UNLOCKED',
  REFRESH_TOKEN_REUSE = 'REFRESH_TOKEN_REUSE',
  SESSION_REVOKED = 'SESSION_REVOKED',
  UNAUTHORIZED_ACCESS = 'UNAUTHORIZED_ACCESS',
  CROSS_TENANT_ACCESS_ATTEMPT = 'CROSS_TENANT_ACCESS_ATTEMPT',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  RATE_LIMIT_TRIGGERED = 'RATE_LIMIT_TRIGGERED',

  // Users
  USER_CREATED = 'USER_CREATED',
  USER_UPDATED = 'USER_UPDATED',
  USER_DISABLED = 'USER_DISABLED',
  ROLE_CHANGED = 'ROLE_CHANGED',
  PERMISSION_CHANGED = 'PERMISSION_CHANGED',

  // Personnel
  PERSONNEL_CREATED = 'PERSONNEL_CREATED',
  PERSONNEL_UPDATED = 'PERSONNEL_UPDATED',
  PERSONNEL_DELETED = 'PERSONNEL_DELETED',

  // Schedules (full lifecycle)
  SCHEDULE_CREATED = 'SCHEDULE_CREATED',
  SCHEDULE_GENERATED = 'SCHEDULE_GENERATED',
  SCHEDULE_UPDATED = 'SCHEDULE_UPDATED',
  SCHEDULE_SUBMITTED = 'SCHEDULE_SUBMITTED',
  SCHEDULE_APPROVED = 'SCHEDULE_APPROVED',
  SCHEDULE_REJECTED = 'SCHEDULE_REJECTED',
  SCHEDULE_PUBLISHED = 'SCHEDULE_PUBLISHED',
  SCHEDULE_ROLLED_BACK = 'SCHEDULE_ROLLED_BACK',
  SCHEDULE_DELETED = 'SCHEDULE_DELETED',

  // Assignments
  ASSIGNMENT_CREATED = 'ASSIGNMENT_CREATED',
  ASSIGNMENT_UPDATED = 'ASSIGNMENT_UPDATED',
  ASSIGNMENT_REMOVED = 'ASSIGNMENT_REMOVED',

  // Attendance
  ATTENDANCE_CREATED = 'ATTENDANCE_CREATED',
  ATTENDANCE_UPDATED = 'ATTENDANCE_UPDATED',

  // Training
  TRAINING_CREATED = 'TRAINING_CREATED',
  TRAINING_UPDATED = 'TRAINING_UPDATED',
  TRAINING_COMPLETED = 'TRAINING_COMPLETED',

  // Devices
  DEVICE_CREATED = 'DEVICE_CREATED',
  DEVICE_UPDATED = 'DEVICE_UPDATED',
  DEVICE_INCIDENT_CREATED = 'DEVICE_INCIDENT_CREATED',

  // Permissions
  ROLE_ASSIGNED = 'ROLE_ASSIGNED',
  ROLE_REMOVED = 'ROLE_REMOVED',
  PERMISSION_GRANTED = 'PERMISSION_GRANTED',
  PERMISSION_REVOKED = 'PERMISSION_REVOKED',

  // System
  SETTINGS_CHANGED = 'SETTINGS_CHANGED',
  CONFIGURATION_UPDATED = 'CONFIGURATION_UPDATED',
}

export const AuditEventLabels: Record<string, string> = {
  // Auth
  LOGIN: 'Giriş Yapıldı',
  LOGOUT: 'Çıkış Yapıldı',
  FAILED_LOGIN: 'Başarısız Giriş',
  PASSWORD_CHANGE: 'Şifre Değiştirildi',
  TOKEN_REFRESH: 'Token Yenilendi',

  // Security
  ACCOUNT_LOCKED: 'Hesap Kilitlendi',
  ACCOUNT_UNLOCKED: 'Hesap Kilidi Açıldı',
  REFRESH_TOKEN_REUSE: 'Refresh Token Yeniden Kullanım',
  SESSION_REVOKED: 'Oturum İptal Edildi',
  UNAUTHORIZED_ACCESS: 'Yetkisiz Erişim',
  CROSS_TENANT_ACCESS_ATTEMPT: 'Çapraz Kiralama Erişim Denemesi',
  PERMISSION_DENIED: 'Yetki Reddedildi',
  RATE_LIMIT_TRIGGERED: 'Hız Sınırı Tetiklendi',

  // Users
  USER_CREATED: 'Kullanıcı Oluşturuldu',
  USER_UPDATED: 'Kullanıcı Güncellendi',
  USER_DISABLED: 'Kullanıcı Devre Dışı',
  ROLE_CHANGED: 'Rol Değiştirildi',
  PERMISSION_CHANGED: 'Yetki Değiştirildi',

  // Personnel
  PERSONNEL_CREATED: 'Personel Oluşturuldu',
  PERSONNEL_UPDATED: 'Personel Güncellendi',
  PERSONNEL_DELETED: 'Personel Silindi',

  // Schedules
  SCHEDULE_CREATED: 'Program Oluşturuldu',
  SCHEDULE_GENERATED: 'Program Oluşturuldu (Otomatik)',
  SCHEDULE_UPDATED: 'Program Güncellendi',
  SCHEDULE_SUBMITTED: 'Program İncelemeye Sunuldu',
  SCHEDULE_APPROVED: 'Program Onaylandı',
  SCHEDULE_REJECTED: 'Program Reddedildi',
  SCHEDULE_PUBLISHED: 'Program Yayınlandı',
  SCHEDULE_ROLLED_BACK: 'Program Geri Alındı',
  SCHEDULE_DELETED: 'Program Silindi',

  // Assignments
  ASSIGNMENT_CREATED: 'Atama Oluşturuldu',
  ASSIGNMENT_UPDATED: 'Atama Güncellendi',
  ASSIGNMENT_REMOVED: 'Atama Kaldırıldı',

  // Attendance
  ATTENDANCE_CREATED: 'Katılım Kaydı Oluşturuldu',
  ATTENDANCE_UPDATED: 'Katılım Kaydı Güncellendi',

  // Training
  TRAINING_CREATED: 'Eğitim Oluşturuldu',
  TRAINING_UPDATED: 'Eğitim Güncellendi',
  TRAINING_COMPLETED: 'Eğitim Tamamlandı',

  // Devices
  DEVICE_CREATED: 'Cihaz Oluşturuldu',
  DEVICE_UPDATED: 'Cihaz Güncellendi',
  DEVICE_INCIDENT_CREATED: 'Cihaz Arızası Bildirildi',

  // Permissions
  ROLE_ASSIGNED: 'Rol Atandı',
  ROLE_REMOVED: 'Rol Kaldırıldı',
  PERMISSION_GRANTED: 'Yetki Verildi',
  PERMISSION_REVOKED: 'Yetki Kaldırıldı',

  // System
  SETTINGS_CHANGED: 'Ayarlar Değiştirildi',
  CONFIGURATION_UPDATED: 'Yapılandırma Güncellendi',
};

export const EntityTypeLabels: Record<string, string> = {
  user: 'Kullanıcı',
  personnel: 'Personel',
  schedule: 'Program',
  assignment: 'Atama',
  attendance: 'Katılım',
  training: 'Eğitim',
  device: 'Cihaz',
  device_incident: 'Cihaz Arızası',
  role: 'Rol',
  permission: 'Yetki',
  setting: 'Ayar',
  configuration: 'Yapılandırma',
  shift: 'Vardiya',
};

export const AUDIT_METADATA_KEY = 'audit:metadata';

export interface AuditMetadata {
  action: string;
  entityType: string;
  description?: string;
}
