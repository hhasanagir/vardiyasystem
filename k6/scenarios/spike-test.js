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
    spike_1000: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "10s", target: 1000 },
        { duration: "30s", target: 1000 },
        { duration: "30s", target: 0 },
      ],
      gracefulStop: "30s",
      tags: { spike: "1000", scenario: "spike" },
    },
    spike_2500: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "15s", target: 2500 },
        { duration: "1m", target: 2500 },
        { duration: "1m", target: 0 },
      ],
      gracefulStop: "1m",
      startTime: "2m",
      tags: { spike: "2500", scenario: "spike" },
    },
    spike_5000: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 5000 },
        { duration: "2m", target: 5000 },
        { duration: "1m30s", target: 0 },
      ],
      gracefulStop: "1m",
      startTime: "5m30s",
      tags: { spike: "5000", scenario: "spike" },
    },
    spike_recovery: {
      executor: "constant-vus",
      vus: 50,
      duration: "1m",
      startTime: "10m",
      tags: { spike: "recovery", scenario: "spike" },
    },
  },
  thresholds: {
    errors: ["rate<0.03"],
    http_req_failed: ["rate<0.02"],
    http_req_duration: ["p(95)<4000", "p(99)<8000"],
    ...Object.fromEntries(
      ["1000", "2500", "5000", "recovery"].flatMap((spike) =>
        ["errors", "http_req_duration", "http_req_failed"].map((k) => {
          const thresholds =
            k === "errors"
              ? ["rate<0.03"]
              : k === "http_req_failed"
                ? ["rate<0.02"]
                : ["p(95)<4000", "p(99)<8000"];
          return [`${k}{scenario:spike,spike:${spike}}`, thresholds];
        }),
      ),
    ),
  },
};

export default function (data) {
  const headers = authHeaders(data.token);
  const spike = exec.vu.tags.spike || "1000";
  const isRecovery = spike === "recovery";

  group(`Spike ${spike}${isRecovery ? " (recovery)" : ""}`, function () {
    if (!isRecovery) {
      for (let i = 0; i < 5; i++) {
        if (i > 0) sleep(0.1);

        const path = [
          "/health",
          "/auth/me",
          "/schedules?month=6&year=2026",
          "/personnel",
          "/units",
          "/devices",
          "/notifications",
          "/swap-requests",
          "/schedules/dashboard/stats",
          "/schedules/my-shifts?month=6&year=2026",
        ][Math.floor(Math.random() * 10)];

        const trend = {
          "/health": "health.live",
          "/auth/me": "auth.profile",
          "/schedules?month=6&year=2026": "schedules.list",
          "/personnel": "personnel.list",
          "/units": "units.list",
          "/devices": "devices.list",
          "/notifications": "notifications.list",
          "/swap-requests": "swapRequests.list",
          "/schedules/dashboard/stats": "schedules.dashboard",
          "/schedules/my-shifts?month=6&year=2026": "schedules.myShifts",
        }[path];

        const s = Date.now();
        const res = http.get(`${BASE_URL}${path}`, { headers });
        const elapsed = Date.now() - s;

        if (trend) {
          const [cat, metric] = trend.split(".");
          if (trends[cat] && trends[cat][metric])
            trends[cat][metric].add(elapsed);
        }

        const expected = path === "/swap-requests" ? [200, 403] : 200;
        checkResponse(res, `spike ${path}`, expected);

        if (res.status >= 500) {
          console.error(
            `SPIKE FAIL ${res.status} on ${path}: ${res.body.substring(0, 150)}`,
          );
        }
      }
    } else {
      const s = Date.now();
      const res = http.get(`${BASE_URL}/health`, { headers });
      trends.health.live.add(Date.now() - s);
      checkResponse(res, "recovery health");
      sleep(1);
    }
  });
}

export { setup };
