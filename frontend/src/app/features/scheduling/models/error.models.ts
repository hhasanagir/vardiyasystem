export type ScheduleErrorSeverity = 'warning' | 'error' | 'critical';

export interface ScheduleError {
  code: number;
  message: string;
  userMessage: string;
  severity: ScheduleErrorSeverity;
  retryable: boolean;
  context?: string;
  details?: Record<string, unknown>;
}

export interface VersionConflictError extends ScheduleError {
  code: 409;
  localVersion: number;
  serverVersion: number;
  scheduleId: string;
}

export function classifyHttpError(
  status: number,
  body: { message?: string; violations?: unknown[]; statusCode?: number },
  context?: string,
): ScheduleError {
  const msg = body?.message ?? 'Bilinmeyen hata';
  switch (status) {
    case 400:
      return {
        code: 400,
        message: msg,
        userMessage: 'Geçersiz istek. Lütfen girdilerinizi kontrol edin.',
        severity: 'warning',
        retryable: false,
        context,
      };
    case 401:
      return {
        code: 401,
        message: msg,
        userMessage: 'Oturumunuzun süresi dolmuş. Lütfen tekrar giriş yapın.',
        severity: 'error',
        retryable: false,
        context,
      };
    case 403:
      return {
        code: 403,
        message: msg,
        userMessage: 'Bu işlem için yetkiniz bulunmuyor.',
        severity: 'error',
        retryable: false,
        context,
      };
    case 404:
      return {
        code: 404,
        message: msg,
        userMessage: 'İstenen kaynak bulunamadı.',
        severity: 'warning',
        retryable: false,
        context,
      };
    case 409: {
      const details = body as {
        serverVersion?: number;
        localVersion?: number;
        scheduleId?: string;
      };
      return {
        code: 409,
        message: msg,
        userMessage: 'Bu plan başka bir kullanıcı tarafından güncellendi.',
        severity: 'warning',
        retryable: true,
        context,
        localVersion: details.localVersion,
        serverVersion: details.serverVersion,
        scheduleId: details.scheduleId,
      } as VersionConflictError;
    }
    case 422:
      return {
        code: 422,
        message: msg,
        userMessage: 'İş kuralı ihlali: ' + msg,
        severity: 'warning',
        retryable: false,
        context,
        details: body as Record<string, unknown>,
      };
    case 429:
      return {
        code: 429,
        message: msg,
        userMessage: 'Çok fazla istek gönderildi. Lütfen biraz bekleyin.',
        severity: 'warning',
        retryable: true,
        context,
      };
    case 500:
    case 502:
    case 503:
      return {
        code: status,
        message: msg,
        userMessage: 'Sunucu hatası. Lütfen daha sonra tekrar deneyin.',
        severity: 'critical',
        retryable: true,
        context,
      };
    default:
      return {
        code: status,
        message: msg,
        userMessage: `Hata (${status}): ${msg}`,
        severity: 'error',
        retryable: false,
        context,
      };
  }
}
