/**
 * P3-13 — scheduled performance smoke scenario.
 *
 * Deliberately short (~30s, 5 VUs): it is meant to run on a schedule/manual
 * dispatch against an ephemeral migrated + seeded stack, not on every PR.
 * It does NOT replace the long load/stress/spike/soak profiles and it does NOT
 * touch the synthetic 5b3 unit benchmark.
 *
 * Latency thresholds are imported verbatim from helpers.js — this scenario
 * never relaxes an existing SLO. The only additional gate is `checks==1`, so a
 * single unexpected status fails the run instead of being averaged away.
 */
import http from 'k6/http';
import { sleep } from 'k6';
import {
  BASE_URL,
  THRESHOLDS,
  trends,
  authHeaders,
  checkResponse,
  getToken,
  setup as sharedSetup,
} from '../helpers.js';

export const options = {
  scenarios: {
    smoke: {
      executor: 'constant-vus',
      vus: 5,
      duration: '30s',
      gracefulStop: '5s',
      tags: { scenario: 'smoke' },
    },
  },
  thresholds: {
    http_req_failed: THRESHOLDS.http_req_failed,
    http_req_duration: THRESHOLDS.http_req_duration,
    auth_profile_ms: THRESHOLDS.auth_profile_ms,
    schedules_list_ms: THRESHOLDS.schedules_list_ms,
    schedules_myshifts_ms: THRESHOLDS.schedules_myshifts_ms,
    personnel_list_ms: THRESHOLDS.personnel_list_ms,
    devices_list_ms: THRESHOLDS.devices_list_ms,
    health_live_ms: THRESHOLDS.health_live_ms,
    health_ready_ms: THRESHOLDS.health_ready_ms,
    checks: ['rate==1'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(95)', 'p(99)', 'count'],
};

export function setup() {
  const data = sharedSetup();
  if (!getToken(data)) {
    // helpers' default credentials are legacy; the workflow supplies the real
    // seeded account through AUTH_EMAIL/AUTH_PASSWORD. Fail closed if not.
    throw new Error(
      'smoke setup failed: no access token. Set AUTH_EMAIL/AUTH_PASSWORD to a seeded user.',
    );
  }
  return data;
}

export default function (data) {
  const headers = authHeaders(getToken(data));

  let started = Date.now();
  // `/health` is behind the global guard (401); `/health/live` is the public
  // liveness probe used by the deploy workflow. Measure the real public route.
  checkResponse(http.get(`${BASE_URL}/health/live`), 'health live');
  trends.health.live.add(Date.now() - started);

  started = Date.now();
  checkResponse(http.get(`${BASE_URL}/health/ready`), 'health ready');
  trends.health.ready.add(Date.now() - started);

  started = Date.now();
  checkResponse(http.get(`${BASE_URL}/auth/me`, { headers }), 'auth me');
  trends.auth.profile.add(Date.now() - started);

  started = Date.now();
  checkResponse(http.get(`${BASE_URL}/schedules`, { headers }), 'schedules list');
  trends.schedules.list.add(Date.now() - started);

  started = Date.now();
  checkResponse(
    http.get(`${BASE_URL}/me/shifts?month=6&year=2026`, { headers }),
    'my shifts',
  );
  trends.schedules.myShifts.add(Date.now() - started);

  started = Date.now();
  checkResponse(http.get(`${BASE_URL}/personnel`, { headers }), 'personnel list');
  trends.personnel.list.add(Date.now() - started);

  started = Date.now();
  checkResponse(http.get(`${BASE_URL}/devices`, { headers }), 'devices list');
  trends.devices.list.add(Date.now() - started);

  sleep(1);
}
