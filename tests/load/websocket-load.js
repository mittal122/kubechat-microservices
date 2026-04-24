// ─────────────────────────────────────────────────────────────
// k6 WebSocket Load Test — Socket.IO Connections
// ─────────────────────────────────────────────────────────────
// Simulates real-time chat with persistent WebSocket connections:
//   Stage 1: Connect    → 100 users    (1 min)
//   Stage 2: Scale      → 1000 users   (2 min)
//   Stage 3: Peak       → 5000 users   (5 min)
//   Stage 4: Disconnect → 0 users      (1 min)
//
// Each VU: connects, joins a chat room, sends messages, receives events
//
// Run: k6 run tests/load/websocket-load.js
// ─────────────────────────────────────────────────────────────

import ws from 'k6/ws';
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Counter, Trend } from 'k6/metrics';

// ── Custom Metrics ──
const wsConnectSuccess = new Rate('ws_connect_success');
const wsMessages = new Counter('ws_messages_sent');
const wsConnectDuration = new Trend('ws_connect_duration', true);

// ── Configuration ──
const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';
const WS_URL = __ENV.WS_URL || 'ws://localhost:5000';

export const options = {
  stages: [
    { duration: '1m', target: 100 },    // Initial connections
    { duration: '2m', target: 1000 },   // Scale up
    { duration: '5m', target: 5000 },   // Peak — 5000 concurrent WebSocket connections
    { duration: '1m', target: 0 },      // Disconnect all
  ],
  thresholds: {
    ws_connect_success: ['rate>0.95'],    // 95% of WS connections must succeed
    ws_connect_duration: ['p(95)<2000'],  // WS connection must establish in <2s
  },
};

// ── Setup: Create test users and get tokens ──
export function setup() {
  const timestamp = Date.now();
  const users = [];

  for (let i = 0; i < 20; i++) {
    const user = {
      name: `ws_loadtest_${timestamp}_${i}`,
      email: `ws_loadtest_${timestamp}_${i}@test.com`,
      password: 'WsLoadTest123!',
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

  console.log(`Setup: Created ${users.length} test users for WebSocket test`);
  return { users };
}

// ── Main WebSocket Test ──
export default function (data) {
  const { users } = data;
  if (!users || users.length === 0) return;

  const user = users[Math.floor(Math.random() * users.length)];

  // Socket.IO uses HTTP polling first, then upgrades to WebSocket
  // The URL format: ws://host/socket.io/?token=JWT&EIO=4&transport=websocket
  const socketUrl = `${WS_URL}/socket.io/?token=${user.token}&EIO=4&transport=websocket`;

  const startTime = Date.now();

  const response = ws.connect(socketUrl, {}, function (socket) {
    const connectTime = Date.now() - startTime;
    wsConnectDuration.add(connectTime);
    wsConnectSuccess.add(1);

    // ── Event: Connection open ──
    socket.on('open', () => {
      // Socket.IO protocol: send connect packet (Engine.IO "4" + Socket.IO "0")
      socket.send('40');

      // Simulate joining a chat and sending messages
      sleep(1);

      // Send a ping every 25 seconds (Socket.IO default)
      socket.setInterval(() => {
        socket.send('2');  // Engine.IO ping
      }, 25000);

      // Send chat messages periodically
      socket.setInterval(() => {
        // Socket.IO event: emit("newMessage", {...})
        const message = JSON.stringify([
          'newMessage',
          {
            text: `Load test message from ${user.name} at ${Date.now()}`,
            timestamp: Date.now(),
          },
        ]);
        socket.send(`42${message}`);
        wsMessages.add(1);
      }, 5000);  // Send a message every 5 seconds
    });

    // ── Event: Received message ──
    socket.on('message', (msg) => {
      // Handle Socket.IO protocol messages
      if (msg === '3') {
        // Pong received — connection is alive
      }
    });

    // ── Event: Error ──
    socket.on('error', (e) => {
      wsConnectSuccess.add(0);
      console.error(`WebSocket error for ${user.name}: ${e.error()}`);
    });

    // ── Event: Close ──
    socket.on('close', () => {
      // Connection closed
    });

    // Keep connection alive for the duration of the stage
    socket.setTimeout(() => {
      socket.close();
    }, 60000);  // Each connection lives for 60 seconds
  });

  // If connection failed
  const connected = check(response, {
    'WebSocket connection established': (r) => r && r.status === 101,
  });

  if (!connected) {
    wsConnectSuccess.add(0);
  }

  sleep(1);
}

// ── Summary ──
export function handleSummary(data) {
  console.log('\n══════════════════════════════════════════');
  console.log('  Chattining — WebSocket Load Test Results');
  console.log('══════════════════════════════════════════');
  console.log(`  Peak VUs:            ${data.metrics.vus_max?.values?.max || 'N/A'}`);
  console.log(`  WS Connect Success:  ${((data.metrics.ws_connect_success?.values?.rate || 0) * 100).toFixed(1)}%`);
  console.log(`  WS Connect P95:      ${Math.round(data.metrics.ws_connect_duration?.values?.['p(95)'] || 0)}ms`);
  console.log(`  Messages Sent:       ${data.metrics.ws_messages_sent?.values?.count || 0}`);
  console.log('══════════════════════════════════════════\n');

  return {
    'tests/load/results/ws-summary.json': JSON.stringify(data, null, 2),
  };
}
