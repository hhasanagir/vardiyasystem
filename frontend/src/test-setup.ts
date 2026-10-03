import { afterEach } from 'vitest';
import { getTestBed } from '@angular/core/testing';
import { getPlatform } from '@angular/core';
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing';

if (typeof (globalThis as { matchMedia?: unknown }).matchMedia !== 'function') {
  (globalThis as { matchMedia: unknown }).matchMedia = () => ({
    matches: false,
    media: '',
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

if (!getPlatform()) {
  getTestBed().initTestEnvironment(
    BrowserDynamicTestingModule,
    platformBrowserDynamicTesting(),
  );
}

afterEach(() => {
  getTestBed().resetTestingModule();
});