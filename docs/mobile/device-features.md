# Device Features Setup Guide

## Camera Integration (`@capacitor/camera`)

Already installed and configured. Use the `CameraService` in frontend.

```typescript
import { inject } from '@angular/core';
import { CameraService } from './services/camera.service';

@Component({...})
export class PhotoUploadComponent {
  private camera = inject(CameraService);

  async uploadPhoto() {
    const photo = await this.camera.takePhoto(false);
    if (photo) {
      // Send to backend via FormData
      const formData = new FormData();
      formData.append('file', this.base64ToBlob(photo.base64String, photo.format));
      // POST to /api/v1/upload
    }
  }
}
```

## File Upload Backend (`multer`)

The MulterConfigService is configured at `backend/src/config/multer.config.ts`.

To use: Add `FileInterceptor` to any controller:

```typescript
@Post('upload')
@UseInterceptors(FileInterceptor('file'))
async uploadFile(@UploadedFile() file: Express.Multer.File) {
  // file.path = saved file path
  // file.filename = generated UUID filename
  return { url: `/uploads/${file.filename}` };
}
```

### Environment Variables

```env
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760
```

## Deep Linking

Configured via `DeepLinkService`. See `deep-link.service.ts` for route mappings.

## Vibration / Haptics

Already configured via `MobileService`:

```typescript
mobile.hapticLight(); // Light tap
mobile.hapticMedium(); // Medium tap
mobile.hapticSuccess(); // Success notification
mobile.hapticError(); // Error notification
```

## Status Bar

- Style: DARK (white text on dark backgrounds)
- Overlays: false
- Managed by `@capacitor/status-bar` (installed)
- Configuration in `capacitor.config.ts`

## Splash Screen

- 1500ms display
- Spinner enabled with blue color
- Background color: `#0f172a`
- Configured in `capacitor.config.ts`

## Device Info

Available via `MobileService.deviceInfo()` signal:

- model, platform, osVersion, batteryLevel
