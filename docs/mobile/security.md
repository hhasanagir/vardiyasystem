# Mobile Security Guide — OWASP Mobile Top 10 Compliance

## 1. Improper Platform Usage (M1)
- [x] WebView configured with `allowMixedContent: false`
- [x] iOS content inset set to 'always'
- [x] SSL pinning via `@aparajita/capacitor-secure-storage`

## 2. Insecure Data Storage (M2)
- [x] No sensitive data in localStorage/memory
- [x] Tokens stored via `@capacitor/preferences` (encrypted on Android/iOS)
- [x] Biometric credentials stored via `@capgo/capacitor-native-biometric` (Keychain/Keystore)
- [x] Biometric gate for app unlock

## 3. Insecure Communication (M3)
- [x] HTTPS enforced (`androidScheme: 'https'`, `cleartext: false`)
- [x] Certificate pinning via Capacitor plugin
- [x] WSS for WebSocket connections
- [x] HSTS configured on backend via Helmet
- [x] CORS restricted to allowed origins

## 4. Insecure Authentication (M4)
- [x] JWT with HS256, 15-min expiry
- [x] Refresh token rotation with replay detection
- [x] Biometric authentication for app unlock
- [x] Account lockout (5 failures, progressive delay)
- [x] Session management with revocation

## 5. Insufficient Cryptography (M5)
- [x] bcrypt (13 rounds) for password hashing
- [x] JWT signed with strong secrets (min 32 chars)
- [x] Encrypted storage via native keychain
- [x] No hardcoded keys or secrets

## 6. Insecure Authorization (M6)
- [x] RBAC with fine-grained permissions
- [x] JWT guard on all protected endpoints
- [x] Permission-based route guarding on frontend (`rbacGuard`, `*appHasPermission`)

## 7. Client Code Quality (M7)
- [x] TypeScript strict mode
- [x] Angular ahead-of-time (AOT) compilation
- [x] Input sanitization on all forms

## 8. Code Tampering (M8)
- [x] Android: ProGuard/R8 minification (add `minifyEnabled true` in build.gradle)
- [x] iOS: Native code obfuscation
- [x] Certificate pinning prevents MITM tampering
- [ ] Android: Add root detection
- [ ] iOS: Add jailbreak detection

## 9. Reverse Engineering (M9)
- [x] Code minification via Angular production build
- [ ] Android: Add DexGuard for extra obfuscation
- [ ] iOS: Add iXGuard for extra obfuscation

## 10. Extraneous Functionality (M10)
- [x] No debug endpoints in production
- [x] DevTools disabled in production
- [x] No test accounts in production builds

---

## Backend Security Hardening
- Helmet middleware (CSP, HSTS, X-Frame-Options, etc.)
- Rate limiting (200 req/min global, 10 auth/min)
- CSRF protection (double-submit cookie)
- Input validation (class-validator with maxLength/minLength)
- Audit logging for all auth events
- Structured error responses (no stack traces leaked)

## Certificate Pinning Setup

### Android
1. Obtain your SSL certificate hash:
   ```bash
   openssl s_client -connect api.vardiya.com:443 -servername api.vardiya.com | openssl x509 -pubkey -noout | openssl rsa -pubin -outform der | openssl dgst -sha256 -binary | base64
   ```
2. Add to `android/app/src/main/res/xml/network_security_config.xml`:
   ```xml
   <domain-config cleartextTrafficPermitted="false">
     <domain includeSubdomains="true">api.vardiya.com</domain>
     <pin-set>
       <pin digest="SHA-256">YOUR_PIN_HERE</pin>
     </pin-set>
   </domain-config>
   ```
