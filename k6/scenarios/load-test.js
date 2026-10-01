import http from "k6/http";
import { check, sleep, group } from "k6";
import { SharedArray } from "k6/data";
import exec from "k6/execution";
import {
  BASE_URL,
  WS_URL,
  trends,
  THRESHOLDS,
  authHeaders,
  checkResponse,
  simulateThinkTime,
  getToken,
  setup as sharedSetup,
} from "../helpers.js";

export const options = {
  scenarios: {
    users_100: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 100 },
        { duration: "2m", target: 100 },
        { duration: "30s", target: 0 },
      ],
      gracefulStop: "30s",
      tags: { tier: "100", scenario: "load" },
    },
    users_500: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "1m", target: 500 },
        { duration: "3m", target: 500 },
        { duration: "1m", target: 0 },
      ],
      gracefulStop: "30s",
      tags: { tier: "500", scenario: "load" },
      startTime: "3m",
    },
    users_1000: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "1m30s", target: 1000 },
        { duration: "4m", target: 1000 },
        { duration: "1m", target: 0 },
      ],
      gracefulStop: "30s",
      tags: { tier: "1000", scenario: "load" },
      startTime: "8m",
    },
    users_2500: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "2m", target: 2500 },
        { duration: "5m", target: 2500 },
        { duration: "1m30s", target: 0 },
      ],
      gracefulStop: "1m",
      tags: { tier: "2500", scenario: "load" },
      startTime: "15m",
    },
    users_5000: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "3m", target: 5000 },
        { duration: "5m", target: 5000 },
        { duration: "2m", target: 0 },
      ],
      gracefulStop: "1m",
      tags: { tier: "5000", scenario: "load" },
      startTime: "24m",
    },
  },
  thresholds: {
    ...THRESHOLDS,
    ...Object.fromEntries(
      ["100", "500", "1000", "2500", "5000"].flatMap((tier) =>
        Object.entries(THRESHOLDS).map(([k, v]) => [
          `${k}{scenario:load,tier:${tier}}`,
          v,
        ]),
      ),
    ),
  },
};

const ENDPOINT_WEIGHTS = {
  read: 0.6,
  write: 0.15,
  heavy: 0.1,
  auth: 0.05,
  health: 0.1,
};

export function setup() {
  return sharedSetup();
}

export default function (data) {
  const token = data.token;
  const headers = authHeaders(token);
  const tier = exec.vu.tags.tier || "100";
  const currentUsers = parseInt(tier);

  const roll = Math.random();

  group("Health & Readiness", function () {
    const s1 = Date.now();
    const r1 = http.get(`${BASE_URL}/health`);
    trends.health.live.add(Date.now() - s1);
    checkResponse(r1, "health endpoint");
    const s2 = Date.now();
    const r2 = http.get(`${BASE_URL}/health/ready`);
    trends.health.ready.add(Date.now() - s2);
    checkResponse(r2, "health ready");
  });

  group("Auth Profile", function () {
    const s = Date.now();
    const r = http.get(`${BASE_URL}/auth/me`, { headers });
    trends.auth.profile.add(Date.now() - s);
    checkResponse(r, "auth me");
  });

  if (roll < ENDPOINT_WEIGHTS.read) {
    group("Read Operations", function () {
      if (Math.random() < 0.2) {
        const s = Date.now();
        const r = http.get(`${BASE_URL}/schedules`, { headers });
        trends.schedules.list.add(Date.now() - s);
        checkResponse(r, "schedules list");
      }
      if (Math.random() < 0.15) {
        const s = Date.now();
        const r = http.get(
          `${BASE_URL}/schedules/my-shifts?month=6&year=2026`,
          { headers },
        );
        trends.schedules.myShifts.add(Date.now() - s);
        checkResponse(r, "my shifts");
      }
      if (Math.random() < 0.15) {
        const s = Date.now();
        const r = http.get(`${BASE_URL}/schedules/dashboard/stats`, {
          headers,
        });
        trends.schedules.dashboard.add(Date.now() - s);
        checkResponse(r, "dashboard stats");
      }
      if (Math.random() < 0.15) {
        const s = Date.now();
        const r = http.get(`${BASE_URL}/personnel`, { headers });
        trends.personnel.list.add(Date.now() - s);
        checkResponse(r, "personnel list");
      }
      if (Math.random() < 0.1) {
        const s = Date.now();
        const r = http.get(`${BASE_URL}/units`, { headers });
        trends.units.list.add(Date.now() - s);
        checkResponse(r, "units list");
      }
      if (Math.random() < 0.1) {
        const s = Date.now();
        const r = http.get(`${BASE_URL}/devices`, { headers });
        trends.devices.list.add(Date.now() - s);
        checkResponse(r, "devices list");
      }
      if (Math.random() < 0.1) {
        const s = Date.now();
        const r = http.get(`${BASE_URL}/notifications`, { headers });
        trends.notifications.list.add(Date.now() - s);
        checkResponse(r, "notifications list");
      }
      if (Math.random() < 0.1) {
        const s = Date.now();
        const r = http.get(`${BASE_URL}/swap-requests`, { headers });
        trends.swapRequests.list.add(Date.now() - s);
        checkResponse(r, "swap requests list");
      }
      if (Math.random() < 0.1) {
        const s = Date.now();
        const r = http.get(`${BASE_URL}/attendance/today`, { headers });
        trends.attendance.today.add(Date.now() - s);
        checkResponse(r, "attendance today");
      }
      if (Math.random() < 0.1) {
        const s = Date.now();
        const r = http.get(`${BASE_URL}/shift-tasks`, { headers });
        trends.shiftTasks.list.add(Date.now() - s);
        checkResponse(r, "shift tasks list");
      }
      if (Math.random() < 0.1) {
        const s = Date.now();
        const r = http.get(`${BASE_URL}/handover-notes`, { headers });
        trends.handoverNotes.list.add(Date.now() - s);
        checkResponse(r, "handover notes list");
      }
      if (Math.random() < 0.05) {
        const s = Date.now();
        const r = http.get(`${BASE_URL}/analytics`, { headers });
        trends.analytics.overview.add(Date.now() - s);
        checkResponse(r, "analytics overview");
      }
      if (Math.random() < 0.05) {
        const s = Date.now();
        const r = http.get(`${BASE_URL}/recommendations`, { headers });
        trends.recommendations.list.add(Date.now() - s);
        checkResponse(r, "recommendations list");
      }
    });
  } else if (roll < ENDPOINT_WEIGHTS.read + ENDPOINT_WEIGHTS.write) {
    group("Write Operations", function () {
      const action = Math.random();
      if (action < 0.3) {
        const start = Date.now();
        const res = http.post(
          `${BASE_URL}/swap-requests`,
          JSON.stringify({
            fromAssignmentId: "00000000-0000-0000-0000-000000000001",
            reason: "Performance test",
          }),
          { headers },
        );
        trends.swapRequests.create.add(Date.now() - start);
        checkResponse(res, "create swap request", [200, 201, 400, 422]);
      } else if (action < 0.5) {
        const start = Date.now();
        const res = http.post(
          `${BASE_URL}/attendance/clock-in`,
          JSON.stringify({ type: "shift_start" }),
          { headers },
        );
        trends.attendance.clock.add(Date.now() - start);
        checkResponse(res, "clock in", [200, 201, 400, 409]);
      } else if (action < 0.7) {
        const start = Date.now();
        const res = http.post(
          `${BASE_URL}/handover-notes`,
          JSON.stringify({
            content: "Performance test handover note",
            unitId: "00000000-0000-0000-0000-000000000001",
          }),
          { headers },
        );
        trends.handoverNotes.create.add(Date.now() - start);
        checkResponse(res, "create handover note", [200, 201, 400, 422]);
      } else if (action < 0.85) {
        const start = Date.now();
        const res = http.patch(
          `${BASE_URL}/shift-tasks/00000000-0000-0000-0000-000000000001/status`,
          JSON.stringify({ status: "completed" }),
          { headers },
        );
        trends.shiftTasks.update.add(Date.now() - start);
        checkResponse(res, "update shift task", [200, 400, 404]);
      } else {
        const start = Date.now();
        const res = http.post(
          `${BASE_URL}/notifications`,
          JSON.stringify({
            userId: "00000000-0000-0000-0000-000000000001",
            title: "Perf test",
            message: "test",
            type: "info",
            priority: "low",
          }),
          { headers },
        );
        trends.notifications.create.add(Date.now() - start);
        checkResponse(res, "create notification", [200, 201, 400, 422]);
      }
    });
  } else if (
    roll <
    ENDPOINT_WEIGHTS.read + ENDPOINT_WEIGHTS.write + ENDPOINT_WEIGHTS.heavy
  ) {
    group("Heavy Operations", function () {
      const action = Math.random();
      if (action < 0.3) {
        const s = Date.now();
        const r = http.get(
          `${BASE_URL}/schedules/export/excel?unit=acil&month=6&year=2026`,
          { headers, responseType: "binary" },
        );
        trends.schedules.export.add(Date.now() - s);
        checkResponse(r, "schedule excel export", [200, 400, 404, 500]);
      } else if (action < 0.5) {
        const s = Date.now();
        const r = http.get(
          `${BASE_URL}/schedules/export/pdf?unit=acil&month=6&year=2026`,
          { headers, responseType: "binary" },
        );
        trends.schedules.export.add(Date.now() - s);
        checkResponse(r, "schedule pdf export", [200, 400, 404, 500]);
      } else if (action < 0.7) {
        const s = Date.now();
        const r = http.get(`${BASE_URL}/schedules/analytics`, { headers });
        trends.analytics.overview.add(Date.now() - s);
        checkResponse(r, "schedule analytics");
      } else if (action < 0.85) {
        const s = Date.now();
        const r = http.get(`${BASE_URL}/analytics/insights`, { headers });
        trends.analytics.insights.add(Date.now() - s);
        checkResponse(r, "analytics insights", [200, 400, 404]);
      } else {
        const s = Date.now();
        const r = http.get(`${BASE_URL}/schedules/pending-approvals`, {
          headers,
        });
        trends.schedules.list.add(Date.now() - s);
        checkResponse(r, "pending approvals");
      }
    });
  } else if (
    roll <
    ENDPOINT_WEIGHTS.read +
      ENDPOINT_WEIGHTS.write +
      ENDPOINT_WEIGHTS.heavy +
      ENDPOINT_WEIGHTS.auth
  ) {
    group("Auth Operations", function () {
      const s = Date.now();
      const res = http.post(
        `${BASE_URL}/auth/login`,
        JSON.stringify({
          email: AUTH_EMAIL || "admin@vardiya.com",
          password: AUTH_PASSWORD || "password123",
        }),
        { headers: { "Content-Type": "application/json" } },
      );
      trends.auth.login.add(Date.now() - s);
      checkResponse(res, "auth login", [200, 429]);
      if (res.status === 200) {
        const newToken =
          res.json("accessToken") ||
          (res.json("data") && res.json("data.accessToken"));
        if (newToken) {
          const s2 = Date.now();
          const r2 = http.get(`${BASE_URL}/auth/me`, {
            headers: authHeaders(newToken),
          });
          trends.auth.profile.add(Date.now() - s2);
        }
      }
    });
  }

  simulateThinkTime(currentUsers);
}

export function teardown(data) {
  if (!data.token) return;
  http.post(
    `${BASE_URL}/auth/logout`,
    {},
    { headers: authHeaders(data.token) },
  );
}
