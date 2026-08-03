// k6 smoke test — validates that critical read paths respond under nominal load.
// Run: k6 run -e BASE_URL=https://api.burgonomics.dev backend/load/k6/smoke.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 5,
  duration: '1m',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<400', 'p(99)<800'],
  },
};

const BASE = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  const health = http.get(`${BASE}/health/readiness`);
  check(health, { 'health 200': (r) => r.status === 200 });

  const menu = http.get(`${BASE}/api/v1/menu`);
  check(menu, { 'menu 200': (r) => r.status === 200 });

  sleep(1);
}
