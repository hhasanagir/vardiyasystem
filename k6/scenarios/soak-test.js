import http from "k6/http";
import { check, sleep, group } from "k6";
import exec from "k6/execution";
import {
  BASE_URL,
  trends,
  THRESHOLDS,
  authHeaders,
  checkResponse,
  getToken,
  setup,
} from "../helpers.js";

export const options = {
  scenarios: {
    soak_100: {
      executor: "constant-vus",
      vus: 100,
      duration: "30m",
      tags: { tier: "100", scenario: "soak" },
    },
    soak_500: {
      executor: "constant-vus",
      vus: 500,
      duration: "1h",
      tags: { tier: "500", scenario: "soak" },
      startTime: "35m",
    },
    soak_1000: {
      executor: "constant-vus",
      vus: 1000,
      duration: "2h",
      tags: { tier: "1000", scenario: "soak" },
      startTime: "1h40m",
    },
  },
  thresholds: {
    errors: ["rate<0.01"],
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<2000", "p(99)<5000"],
    ...Object.fromEntries(
      ["100", "500", "1000"].flatMap((tier) => [
        [
          `http_req_duration{scenario:soak,tier:${tier}}`,
          ["p(95)<2000", "p(99)<5000", "avg<500"],
        ],
        [`errors{scenario:soak,tier:${tier}}`, ["rate<0.01"]],
      ]),
    ),
  },
};

const ENDPOINTS = [
  { path: "/health", weight: 8, trend: "health.live", auth: false },
  { path: "/health/ready", weight: 6, trend: "health.ready", auth: false },
  { path: "/auth/me", weight: 10, trend: "auth.profile", auth: true },
  {
    path: "/schedules?month=6&year=2026",
    weight: 10,
    trend: "schedules.list",
    auth: true,
  },
  {
    path: "/schedules/my-shifts?month=6&year=2026",
    weight: 8,
    trend: "schedules.myShifts",
    auth: true,
  },
  {
    path: "/schedules/dashboard/stats",
    weight: 8,
    trend: "schedules.dashboard",
    auth: true,
  },
  { path: "/personnel", weight: 8, trend: "personnel.list", auth: true },
  { path: "/units", weight: 6, trend: "units.list", auth: true },
  { path: "/devices", weight: 6, trend: "devices.list", auth: true },
  {
    path: "/notifications",
    weight: 6,
    trend: "notifications.list",
    auth: true,
  },
  { path: "/swap-requests", weight: 5, trend: "swapRequests.list", auth: true },
  {
    path: "/attendance/today",
    weight: 4,
    trend: "attendance.today",
    auth: true,
  },
  { path: "/shift-tasks", weight: 4, trend: "shiftTasks.list", auth: true },
  {
    path: "/handover-notes",
    weight: 4,
    trend: "handoverNotes.list",
    auth: true,
  },
  { path: "/analytics", weight: 3, trend: "analytics.overview", auth: true },
  {
    path: "/recommendations",
    weight: 2,
    trend: "recommendations.list",
    auth: true,
  },
  {
    path: "/schedules/analytics",
    weight: 2,
    trend: "analytics.overview",
    auth: true,
  },
];

function pickEndpoint() {
  const total = ENDPOINTS.reduce((s, e) => s + e.weight, 0);
  let r = Math.random() * total;
  for (const ep of ENDPOINTS) {
    r -= ep.weight;
    if (r <= 0) return ep;
  }
  return ENDPOINTS[ENDPOINTS.length - 1];
}

export default function (data) {
  const headers = authHeaders(data.token);
  const tier = exec.vu.tags.tier || "100";
  const currentUsers = parseInt(tier);

  const requestCount = currentUsers <= 100 ? 3 : currentUsers <= 500 ? 5 : 8;

  for (let i = 0; i < requestCount; i++) {
    const ep = pickEndpoint();
    const s = Date.now();
    const res = http.get(`${BASE_URL}${ep.path}`, ep.auth ? { headers } : {});
    const elapsed = Date.now() - s;

    if (ep.trend) {
      const [cat, metric] = ep.trend.split(".");
      if (trends[cat] && trends[cat][metric]) trends[cat][metric].add(elapsed);
    }

    checkResponse(
      res,
      `soak ${ep.path}`,
      ep.path.includes("swap") ? [200, 403] : 200,
    );

    if (elapsed > 5000) {
      console.warn(`SOAK SLOW ${ep.path}: ${elapsed}ms at tier ${tier}`);
    }
    if (res.status >= 500) {
      console.error(
        `SOAK ERROR ${res.status} on ${ep.path}: ${res.body.substring(0, 200)}`,
      );
    }

    sleep(0.2 + Math.random() * 0.3);
  }

  sleep(1 + Math.random());
}

export { setup };
