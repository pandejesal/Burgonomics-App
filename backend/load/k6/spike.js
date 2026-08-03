// k6 spike test — sudden 10x burst simulating flash-sale traffic.
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 50 },
    { duration: '30s', target: 1500 },
    { duration: '2m', target: 1500 },
    { duration: '30s', target: 50 },
    { duration: '2m', target: 50 },
  ],
  thresholds: { http_req_failed: ['rate<0.05'] },
};

const BASE = __ENV.BASE_URL || 'http://localhost:3000';
export default function () {
  http.get(`${BASE}/api/v1/menu`);
}
