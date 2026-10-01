import http from "k6/http";
import { check, sleep } from "k6";
import { Rate } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000/api/v1";
const errorRate = new Rate("errors");

export const options = {
  stages: [
    { duration: "10s", target: 20 },
    { duration: "30s", target: 20 },
    { duration: "10s", target: 0 },
  ],
  thresholds: {
    errors: ["rate<0.05"],
    http_req_duration: ["p(95)<2000", "p(99)<5000"],
  },
};

export default function () {
  const health = http.get(`${BASE_URL}/health`);
  check(health, { "health status 200": (r) => r.status === 200 });
  errorRate.add(health.status !== 200);
  sleep(1);
}
