// k6 soak test — 4 hours at nominal load, catches leaks and drift.
import http from 'k6/http';
import { sleep } from 'k6';

export const options = {
  vus: 80,
  duration: '4h',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500'],
  },
};

const BASE = __ENV.BASE_URL || 'http://localhost:3000';
export default function () {
  http.get(`${BASE}/api/v1/menu`);
  sleep(2);
}
