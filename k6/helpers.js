import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend, Counter, Gauge } from "k6/metrics";

export const BASE_URL = __ENV.BASE_URL || "http://localhost:3000/api/v1";
export const WS_URL = __ENV.WS_URL || "http://localhost:3000";
export const AUTH_EMAIL = __ENV.AUTH_EMAIL || "admin@vardiya.com";
export const AUTH_PASSWORD = __ENV.AUTH_PASSWORD || "password123";

export const errorRate = new Rate("errors");
export const bottleneckDetected = new Counter("bottleneck_detected");

export const trends = {
  auth: {
    login: new Trend("auth_login_ms"),
    profile: new Trend("auth_profile_ms"),
    refresh: new Trend("auth_refresh_ms"),
  },
  schedules: {
    list: new Trend("schedules_list_ms"),
    detail: new Trend("schedules_detail_ms"),
    create: new Trend("schedules_create_ms"),
    myShifts: new Trend("schedules_myshifts_ms"),
    export: new Trend("schedules_export_ms"),
    dashboard: new Trend("schedules_dashboard_ms"),
  },
  personnel: {
    list: new Trend("personnel_list_ms"),
    create: new Trend("personnel_create_ms"),
    update: new Trend("personnel_update_ms"),
  },
  units: {
    list: new Trend("units_list_ms"),
    detail: new Trend("units_detail_ms"),
  },
  devices: {
    list: new Trend("devices_list_ms"),
    status: new Trend("devices_status_ms"),
  },
  notifications: {
    list: new Trend("notifications_list_ms"),
    create: new Trend("notifications_create_ms"),
  },
  swapRequests: {
    list: new Trend("swap_requests_list_ms"),
    create: new Trend("swap_requests_create_ms"),
  },
  attendance: {
    today: new Trend("attendance_today_ms"),
    clock: new Trend("attendance_clock_ms"),
  },
  shiftTasks: {
    list: new Trend("shift_tasks_list_ms"),
    update: new Trend("shift_tasks_update_ms"),
  },
  handoverNotes: {
    list: new Trend("handover_notes_list_ms"),
    create: new Trend("handover_notes_create_ms"),
  },
  analytics: {
    overview: new Trend("analytics_overview_ms"),
    insights: new Trend("analytics_insights_ms"),
  },
  recommendations: { list: new Trend("recommendations_list_ms") },
  health: {
    live: new Trend("health_live_ms"),
    ready: new Trend("health_ready_ms"),
  },
};

export const THRESHOLDS = {
  errors: ["rate<0.01"],
  http_req_failed: ["rate<0.01"],
  http_req_duration: ["p(95)<2000", "p(99)<5000", "avg<500"],
  auth_login_ms: ["p(95)<1500", "p(99)<3000"],
  auth_profile_ms: ["p(95)<500", "p(99)<1000"],
  schedules_list_ms: ["p(95)<2000", "p(99)<4000"],
  schedules_myshifts_ms: ["p(95)<2000", "p(99)<4000"],
  schedules_dashboard_ms: ["p(95)<3000", "p(99)<5000"],
  personnel_list_ms: ["p(95)<1500", "p(99)<3000"],
  units_list_ms: ["p(95)<1000", "p(99)<2000"],
  devices_list_ms: ["p(95)<1000", "p(99)<2000"],
  notifications_list_ms: ["p(95)<1500", "p(99)<3000"],
  swap_requests_list_ms: ["p(95)<1500", "p(99)<3000"],
  attendance_today_ms: ["p(95)<1500", "p(99)<3000"],
  shift_tasks_list_ms: ["p(95)<1000", "p(99)<2000"],
  handover_notes_list_ms: ["p(95)<1500", "p(99)<3000"],
  analytics_overview_ms: ["p(95)<3000", "p(99)<5000"],
  recommendations_list_ms: ["p(95)<2000", "p(99)<4000"],
  health_live_ms: ["p(95)<200", "p(99)<500"],
  health_ready_ms: ["p(95)<500", "p(99)<1000"],
};

export const stageProfiles = {
  rampUp: (target) => ({ duration: "30s", target }),
  steady: (target, min) => ({
    duration: `${Math.max(min || 2, Math.ceil(target / 500))}m`,
    target,
  }),
  rampDown: (target) => ({ duration: "30s", target }),
};

export function buildStages(target, steadyMinutes) {
  return [
    stageProfiles.rampUp(target),
    stageProfiles.steady(target, steadyMinutes),
    stageProfiles.rampDown(0),
  ];
}

const TOKEN_POOL = [];
let TOKEN_POOL_INDEX = 0;

export function setup() {
  const res = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({
      email: AUTH_EMAIL,
      password: AUTH_PASSWORD,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
  check(res, { "setup login successful": (r) => r.status === 200 });
  const body = res.json();
  const token = body.accessToken || (body.data && body.data.accessToken);
  return { token };
}

export function getToken(data) {
  return data.token;
}

export function authHeaders(token) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export function measure(name, fn) {
  const start = Date.now();
  const result = fn();
  const elapsed = Date.now() - start;
  if (trends[name]) {
    trends[name].add(elapsed);
  }
  bottleneckDetected.add(elapsed > 5000 ? 1 : 0);
  return { result, elapsed };
}

export function checkResponse(res, name, expectedStatus = 200) {
  const passed = check(res, {
    [`${name} status ${expectedStatus}`]: (r) => r.status === expectedStatus,
  });
  if (!passed) {
    errorRate.add(1);
    console.error(`FAIL: ${name} returned ${res.status} ${res.body}`);
  } else {
    errorRate.add(0);
  }
  return passed;
}

export function simulateThinkTime(userTier) {
  if (userTier <= 100) sleep(3 + Math.random() * 2);
  else if (userTier <= 500) sleep(2 + Math.random());
  else if (userTier <= 1000) sleep(1 + Math.random() * 0.5);
  else sleep(0.5 + Math.random() * 0.3);
}

export function randomId() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function detectBottlenecks(metrics) {
  const bottlenecks = [];
  if (metrics.http_req_duration && metrics.http_req_duration["p(95)"] > 2000) {
    bottlenecks.push({
      component: "API Gateway",
      metric: "p95 latency",
      value: metrics.http_req_duration["p(95)"],
      threshold: 2000,
      severity: "warning",
    });
  }
  if (metrics.http_req_duration && metrics.http_req_duration["p(99)"] > 5000) {
    bottlenecks.push({
      component: "API Gateway",
      metric: "p99 latency",
      value: metrics.http_req_duration["p(99)"],
      threshold: 5000,
      severity: "critical",
    });
  }
  const endpointChecks = [
    {
      name: "auth_login_ms",
      component: "Auth Service",
      p95threshold: 1500,
      p99threshold: 3000,
    },
    {
      name: "schedules_list_ms",
      component: "Schedules Service",
      p95threshold: 2000,
      p99threshold: 4000,
    },
    {
      name: "schedules_dashboard_ms",
      component: "Dashboard Aggregation",
      p95threshold: 3000,
      p99threshold: 5000,
    },
    {
      name: "schedules_export_ms",
      component: "Export Service",
      p95threshold: 5000,
      p99threshold: 10000,
    },
    {
      name: "analytics_overview_ms",
      component: "Analytics Service",
      p95threshold: 3000,
      p99threshold: 5000,
    },
    {
      name: "personnel_list_ms",
      component: "Personnel Service",
      p95threshold: 1500,
      p99threshold: 3000,
    },
  ];
  for (const check of endpointChecks) {
    if (metrics[check.name]) {
      if (metrics[check.name]["p(95)"] > check.p95threshold) {
        bottlenecks.push({
          component: check.component,
          metric: "p95",
          value: metrics[check.name]["p(95)"],
          threshold: check.p95threshold,
          severity: "warning",
        });
      }
      if (metrics[check.name]["p(99)"] > check.p99threshold) {
        bottlenecks.push({
          component: check.component,
          metric: "p99",
          value: metrics[check.name]["p(99)"],
          threshold: check.p99threshold,
          severity: "critical",
        });
      }
    }
  }
  return bottlenecks;
}
