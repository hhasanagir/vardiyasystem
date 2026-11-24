import type { Browser } from '@playwright/test';

/** Storage states produced by `global-setup` after a real API login. */
export type FixtureAccount = 'admin' | 'supervisor' | 'technician' | 'engineer';

export const STATE_FILES: Record<FixtureAccount, string> = {
  admin: 'fixtures/.auth/admin.json',
  supervisor: 'fixtures/.auth/supervisor.json',
  technician: 'fixtures/.auth/technician.json',
  engineer: 'fixtures/.auth/engineer.json',
};

/**
 * Opens a context that is already signed in. The session came from the real
 * login endpoint (see `global-setup`), so the app has to accept it exactly as it
 * would accept a session created by the login screen.
 */
export async function signedInContext(browser: Browser, who: FixtureAccount) {
  return browser.newContext({ storageState: STATE_FILES[who] });
}
