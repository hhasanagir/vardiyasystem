import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class CameraService {
  takePhoto(): Observable<string | null> {
    return of(null);
  }

  pickFromGallery(): Observable<string | null> {
    return of(null);
  }
}
