import http from "k6/http";
import { check, sleep, group } from "k6";
import exec from "k6/execution";
import {
  BASE_URL,
  WS_URL,
  trends,
  THRESHOLDS,
  authHeaders,
  checkResponse,
  getToken,
  setup,
} from "../helpers.js";

export const options = {
  scenarios: {
    stress_ramp: {
      executor: "ramping-arrival-rate",
      startRate: 10,
      timeUnit: "1s",
      preAllocatedVUs: 100,
      maxVUs: 2000,
      stages: [
        { duration: "2m", target: 50 },
        { duration: "2m", target: 100 },
        { duration: "2m", target: 200 },
        { duration: "2m", target: 400 },
        { duration: "2m", target: 600 },
        { duration: "2m", target: 800 },
        { duration: "2m", target: 1000 },
        { duration: "2m", target: 1200 },
        { duration: "2m", target: 1500 },
        { duration: "5m", target: 1500 },
        { duration: "2m", target: 0 },
      ],
      gracefulStop: "2m",
      tags: { scenario: "stress" },
    },
  },
  thresholds: {
    errors: ["rate<0.05"],
    http_req_failed: ["rate<0.03"],
    http_req_duration: ["p(95)<5000", "p(99)<10000"],
    auth_login_ms: ["p(95)<3000"],
    schedules_list_ms: ["p(95)<5000"],
    personnel_list_ms: ["p(95)<3000"],
    health_live_ms: ["p(95)<500"],
  },
};

const READ_MIX = [
  { path: "/health", weight: 15, trend: null },
  { path: "/health/ready", weight: 10, trend: null },
  { path: "/auth/me", weight: 10, trend: "auth.profile" },
  { path: "/schedules?month=6&year=2026", weight: 10, trend: "schedules.list" },
  {
    path: "/schedules/my-shifts?month=6&year=2026",
    weight: 8,
    trend: "schedules.myShifts",
  },
  {
    path: "/schedules/dashboard/stats",
    weight: 8,
    trend: "schedules.dashboard",
  },
  { path: "/personnel", weight: 8, trend: "personnel.list" },
  { path: "/units", weight: 6, trend: "units.list" },
  { path: "/devices", weight: 6, trend: "devices.list" },
  { path: "/notifications", weight: 6, trend: "notifications.list" },
  { path: "/swap-requests", weight: 5, trend: "swapRequests.list" },
  { path: "/attendance/today", weight: 4, trend: "attendance.today" },
  { path: "/shift-tasks", weight: 4, trend: "shiftTasks.list" },
];

function pickWeighted(items) {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = Math.random() * total;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}

export default function (data) {
  const headers = authHeaders(data.token);
  const endpoint = pickWeighted(READ_MIX);
  const isAuth = endpoint.path.startsWith("/auth/");

  const s = Date.now();
  const res = isAuth
    ? http.post(
        `${BASE_URL}/auth/login`,
        JSON.stringify({ email: "admin@vardiya.com", password: "password123" }),
        { headers: { "Content-Type": "application/json" } },
      )
    : http.get(`${BASE_URL}${endpoint.path}`, { headers });
  const elapsed = Date.now() - s;

  if (endpoint.trend && trends[endpoint.trend]) {
    trends[endpoint.trend].add(elapsed);
  }

  checkResponse(res, `stress ${endpoint.path}`, [200, 429]);

  if (res.status === 429) {
    console.warn(`Rate limited on ${endpoint.path}`);
  }

  if (res.status >= 500) {
    console.error(
      `SERVER ERROR ${res.status} on ${endpoint.path}: ${res.body.substring(0, 200)}`,
    );
  }

  sleep(0.2 + Math.random() * 0.3);
}

export { setup };
