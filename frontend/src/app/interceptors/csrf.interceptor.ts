import { HttpInterceptorFn } from '@angular/common/http';

export const csrfInterceptor: HttpInterceptorFn = (req, next) => {
  const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);
  if (safeMethods.has(req.method)) {
    return next(req);
  }

  const csrfCookie = parseCookie(document.cookie)['csrf-token'];
  if (!csrfCookie) {
    return next(req);
  }

  const cloned = req.clone({
    setHeaders: {
      'X-CSRF-Token': csrfCookie,
    },
  });
  return next(cloned);
};

function parseCookie(cookie: string): Record<string, string> {
  const result: Record<string, string> = {};
  cookie.split(';').forEach((pair) => {
    const [key, ...rest] = pair.trim().split('=');
    if (key) {
      result[key] = rest.join('=');
    }
  });
  return result;
}
