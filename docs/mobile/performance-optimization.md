# Mobile Performance Optimization Guide

## Cold Start Optimization (< 3s)

### Lazy Loading

- All routes use `loadComponent` (Angular 21 standalone pattern) — already implemented
- Verify all feature modules are lazy-loaded

### Bundle Optimization

```bash
# Analyze bundle
npx ng build --stats-json
npx source-map-explorer dist/frontend/browser/*.js
```

### Angular Configuration

```json
// angular.json production config
"optimization": {
  "scripts": true,
  "styles": { "minify": true, "inlineCritical": true },
  "fonts": { "inline": true }
},
"outputHashing": "all",
"namedChunks": true,
"aot": true
```

### Capacitor-Specific

- Enable android: `android:hardwareAccelerated="true"` in AndroidManifest.xml
- Enable iOS: Metal rendering (default in modern iOS)
- Use skeleton screens during data loading (already implemented as `app-skeleton`)

### Service Worker Caching

```json
// ngsw-config.json — already configured with performance (cache-first) strategy for:
// - /api/v1/personnel
// - /api/v1/units
// - /api/v1/devices
// - /api/v1/shifts
```

## Image Optimization

- Use `<img loading="lazy">` for all images
- Serve images in WebP format where possible
- Use srcset for responsive images

## CSS Optimization

- Remove unused CSS via purge (consider using PurgeCSS in build pipeline)
- Inline critical CSS (already configured via `inlineCritical: true`)
- Prefer CSS Grid over float-based layouts

## JavaScript Optimization

- Use `ChangeDetectionStrategy.OnPush` everywhere (already done)
- Avoid large third-party libraries
- Use `trackBy` in `@for` loops
- Consider `@defer` blocks for heavy components (Angular 21 feature)

## Webpack/Ivy Optimization

- Enable `compress` on the backend Express server
- Use Brotli compression for better ratios
