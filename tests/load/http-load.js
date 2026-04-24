// ─────────────────────────────────────────────────────────────
// k6 HTTP Load Test — REST API Endpoints
// ─────────────────────────────────────────────────────────────
// Simulates realistic user behavior across all microservices:
//   Stage 1: Warm-up      →  50 users  (1 min)
//   Stage 2: Ramp-up      → 500 users  (2 min)
//   Stage 3: Spike         → 2000 users (3 min)
//   Stage 4: Peak load    → 5000 users (5 min)
//   Stage 5: Cool-down    →  50 users  (1 min)
//
// Run: k6 run tests/load/http-load.js
// ─────────────────────────────────────────────────────────────

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// ── Custom Metrics ──
const errorRate = new Rate('errors');
const loginDuration = new Trend('login_duration', true);
const messageDuration = new Trend('message_send_duration', true);

// ── Configuration ──
const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';

export const options = {
  stages: [
    { duration: '1m', target: 50 },    // Warm-up
    { duration: '2m', target: 500 },   // Ramp to moderate load
    { duration: '3m', target: 2000 },  // Ramp to heavy load
    { duration: '5m', target: 5000 },  // Peak load — 5000 concurrent users
    { duration: '1m', target: 50 },    // Cool-down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],   // 95% of requests must complete in <500ms
    errors: ['rate<0.01'],              // Error rate must be below 1%
    login_duration: ['p(95)<800'],      // Login must be <800ms at p95
  },
};

// ── Setup: Create test users ──
export function setup() {
  const timestamp = Date.now();
  const users = [];

  // Create 10 test users for the load test
  for (let i = 0; i < 10; i++) {
    const user = {
      name: `loadtest_user_${timestamp}_${i}`,
      email: `loadtest_${timestamp}_${i}@test.com`,
      password: 'LoadTest123!',
    };

    const res = http.post(`${BASE_URL}/api/auth/register`, JSON.stringify(user), {
      headers: { 'Content-Type': 'application/json' },
    });

    if (res.status === 201) {
      const body = JSON.parse(res.body);
      users.push({
        ...user,
        id: body.user?._id || body.user?.id,
        token: body.accessToken,
      });
    }
  }

  console.log(`Setup: Created ${users.length} test users`);
  return { users };
}

// ── Main Test Scenario ──
export default function (data) {
  const { users } = data;
  if (!users || users.length === 0) {
    console.error('No test users available');
    return;
  }

  // Pick a random user for this VU
  const user = users[Math.floor(Math.random() * users.length)];
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${user.token}`,
  };

  // ── Test 1: Login ──
  group('Auth — Login', () => {
    const start = Date.now();
    const res = http.post(
      `${BASE_URL}/api/auth/login`,
      JSON.stringify({ email: user.email, password: user.password }),
      { headers: { 'Content-Type': 'application/json' } }
    );

    loginDuration.add(Date.now() - start);
    const success = check(res, {
      'login returns 200': (r) => r.status === 200,
      'login returns token': (r) => JSON.parse(r.body).accessToken !== undefined,
    });
    errorRate.add(!success);
  });

  sleep(0.5);

  // ── Test 2: Get Current User ──
  group('Auth — Get Profile', () => {
    const res = http.get(`${BASE_URL}/api/auth/me`, { headers });
    const success = check(res, {
      'profile returns 200': (r) => r.status === 200,
    });
    errorRate.add(!success);
  });

  sleep(0.3);

  // ── Test 3: List Users ──
  group('Users — List', () => {
    const res = http.get(`${BASE_URL}/api/users`, { headers });
    const success = check(res, {
      'users list returns 200': (r) => r.status === 200,
    });
    errorRate.add(!success);
  });

  sleep(0.3);

  // ── Test 4: Search Users ──
  group('Users — Search', () => {
    const res = http.get(`${BASE_URL}/api/users/search?query=loadtest`, { headers });
    const success = check(res, {
      'search returns 200': (r) => r.status === 200,
    });
    errorRate.add(!success);
  });

  sleep(0.3);

  // ── Test 5: Send Message (if we have 2+ users) ──
  if (users.length >= 2) {
    group('Chat — Send Message', () => {
      const receiver = users.find((u) => u.id !== user.id);
      if (!receiver) return;

      const start = Date.now();
      const res = http.post(
        `${BASE_URL}/api/messages/${receiver.id}`,
        JSON.stringify({ text: `Load test message at ${Date.now()}` }),
        { headers }
      );

      messageDuration.add(Date.now() - start);
      const success = check(res, {
        'message send returns 201': (r) => r.status === 201,
      });
      errorRate.add(!success);
    });
  }

  sleep(0.5);

  // ── Test 6: Get Conversations ──
  group('Chat — List Conversations', () => {
    const res = http.get(`${BASE_URL}/api/conversations`, { headers });
    const success = check(res, {
      'conversations returns 200': (r) => r.status === 200,
    });
    errorRate.add(!success);
  });

  sleep(1);
}

// ── Summary ──
export function handleSummary(data) {
  console.log('\n══════════════════════════════════════');
  console.log('  Chattining — HTTP Load Test Results');
  console.log('══════════════════════════════════════');
  console.log(`  Peak VUs:        ${data.metrics.vus_max?.values?.max || 'N/A'}`);
  console.log(`  Total Requests:  ${data.metrics.http_reqs?.values?.count || 'N/A'}`);
  console.log(`  Avg Duration:    ${Math.round(data.metrics.http_req_duration?.values?.avg || 0)}ms`);
  console.log(`  P95 Duration:    ${Math.round(data.metrics.http_req_duration?.values?.['p(95)'] || 0)}ms`);
  console.log(`  Error Rate:      ${((data.metrics.errors?.values?.rate || 0) * 100).toFixed(2)}%`);
  console.log('══════════════════════════════════════\n');

  return {
    'tests/load/results/http-summary.json': JSON.stringify(data, null, 2),
  };
}
