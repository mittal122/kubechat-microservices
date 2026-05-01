/**
 * KubeChat Real-Time Test Suite
 * 
 * Run on EC2:
 *   cd /opt/kubechat
 *   node services/chat-service/test-realtime.js
 * 
 * Tests:
 *   1. Socket server reachable
 *   2. JWT auth (no token, bad token, good token)
 *   3. Online/offline presence
 *   4. Real-time message delivery
 */

const { io: ioClient } = require('socket.io-client');
const jwt = require('jsonwebtoken');
const http = require('http');
require('dotenv').config({ path: '/opt/kubechat/.env' });

// ── Config ──────────────────────────────────────────────────────
const CHAT_URL   = 'http://localhost:5003';
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error('❌ JWT_SECRET not found in /opt/kubechat/.env');
  process.exit(1);
}

// ── Helpers ──────────────────────────────────────────────────────
const makeToken = (userId) =>
  jwt.sign({ userId, email: `test_${userId}@test.com` }, JWT_SECRET, { expiresIn: '1h' });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let passed = 0;
let failed = 0;

function pass(name) {
  console.log(`  ✅ PASS: ${name}`);
  passed++;
}

function fail(name, reason) {
  console.error(`  ❌ FAIL: ${name} — ${reason}`);
  failed++;
}

// ── Test 1: Health Check ─────────────────────────────────────────
async function testHealthCheck() {
  console.log('\n📋 TEST 1: Chat service health check');
  return new Promise((resolve) => {
    http.get(`${CHAT_URL}/health`, (res) => {
      let body = '';
      res.on('data', (d) => body += d);
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          if (data.status === 'healthy') {
            pass('Health endpoint returns healthy');
          } else {
            fail('Health endpoint', `status = ${data.status}`);
          }
        } catch {
          fail('Health endpoint', 'could not parse JSON');
        }
        resolve();
      });
    }).on('error', (e) => {
      fail('Health endpoint', `connection refused: ${e.message}`);
      resolve();
    });
  });
}

// ── Test 2: Socket.IO polling reachable ──────────────────────────
async function testPollingEndpoint() {
  console.log('\n📋 TEST 2: Socket.IO polling endpoint reachable');
  return new Promise((resolve) => {
    http.get(`${CHAT_URL}/socket.io/?EIO=4&transport=polling`, (res) => {
      let body = '';
      res.on('data', (d) => body += d);
      res.on('end', () => {
        if (res.statusCode === 200 && body.includes('sid')) {
          pass('Socket.IO polling endpoint returns session ID');
        } else {
          fail('Socket.IO polling endpoint', `status=${res.statusCode}, body=${body.substring(0, 100)}`);
        }
        resolve();
      });
    }).on('error', (e) => {
      fail('Socket.IO polling endpoint', e.message);
      resolve();
    });
  });
}

// ── Test 3: JWT Auth — no token ──────────────────────────────────
async function testNoToken() {
  console.log('\n📋 TEST 3: Socket rejects connection with no token');
  return new Promise((resolve) => {
    const socket = ioClient(CHAT_URL, {
      transports: ['polling', 'websocket'],
      reconnection: false,
    });
    const timer = setTimeout(() => {
      fail('No-token rejection', 'timed out (no connect error received)');
      socket.disconnect();
      resolve();
    }, 5000);

    socket.on('connect', () => {
      clearTimeout(timer);
      fail('No-token rejection', 'socket CONNECTED — server should have rejected it!');
      socket.disconnect();
      resolve();
    });
    socket.on('connect_error', (err) => {
      clearTimeout(timer);
      pass(`No-token correctly rejected: ${err.message}`);
      socket.disconnect();
      resolve();
    });
  });
}

// ── Test 4: JWT Auth — invalid token ────────────────────────────
async function testBadToken() {
  console.log('\n📋 TEST 4: Socket rejects invalid JWT');
  return new Promise((resolve) => {
    const socket = ioClient(CHAT_URL, {
      transports: ['polling', 'websocket'],
      auth: { token: 'totally.invalid.token' },
      reconnection: false,
    });
    const timer = setTimeout(() => {
      fail('Bad-token rejection', 'timed out');
      socket.disconnect();
      resolve();
    }, 5000);

    socket.on('connect', () => {
      clearTimeout(timer);
      fail('Bad-token rejection', 'socket CONNECTED — server should have rejected it!');
      socket.disconnect();
      resolve();
    });
    socket.on('connect_error', (err) => {
      clearTimeout(timer);
      pass(`Bad token correctly rejected: ${err.message}`);
      socket.disconnect();
      resolve();
    });
  });
}

// ── Test 5: JWT Auth — valid token ──────────────────────────────
async function testValidToken() {
  console.log('\n📋 TEST 5: Socket connects with valid JWT');
  return new Promise((resolve) => {
    const userId = 'test_user_aaa';
    const token = makeToken(userId);
    const socket = ioClient(CHAT_URL, {
      transports: ['polling', 'websocket'],
      auth: { token },
      reconnection: false,
    });
    const timer = setTimeout(() => {
      fail('Valid token connect', 'timed out — could not connect in 5s');
      socket.disconnect();
      resolve();
    }, 5000);

    socket.on('connect', () => {
      clearTimeout(timer);
      pass(`Connected with valid token (socket id: ${socket.id})`);
      socket.disconnect();
      resolve();
    });
    socket.on('connect_error', (err) => {
      clearTimeout(timer);
      fail('Valid token connect', err.message);
      socket.disconnect();
      resolve();
    });
  });
}

// ── Test 6: Online/Offline Presence ─────────────────────────────
async function testPresence() {
  console.log('\n📋 TEST 6: Online/Offline presence tracking');
  return new Promise(async (resolve) => {
    const userAId = 'test_presence_aaa';
    const userBId = 'test_presence_bbb';

    const socketA = ioClient(CHAT_URL, {
      transports: ['polling', 'websocket'],
      auth: { token: makeToken(userAId) },
      reconnection: false,
    });

    // Wait for A to connect
    await new Promise((r) => {
      socketA.on('connect', r);
      socketA.on('connect_error', (e) => {
        fail('Presence test: userA connect', e.message);
        r();
      });
      setTimeout(r, 5000);
    });

    if (!socketA.connected) {
      fail('Presence tracking', 'userA could not connect');
      socketA.disconnect();
      resolve();
      return;
    }

    // Connect B and track what A sees
    const socketB = ioClient(CHAT_URL, {
      transports: ['polling', 'websocket'],
      auth: { token: makeToken(userBId) },
      reconnection: false,
    });

    let onlineUsersSeenByA = [];
    socketA.on('getOnlineUsers', (users) => {
      onlineUsersSeenByA = users;
    });

    await new Promise((r) => {
      socketB.on('connect', r);
      socketB.on('connect_error', (e) => {
        fail('Presence test: userB connect', e.message);
        r();
      });
      setTimeout(r, 5000);
    });

    await wait(500); // let getOnlineUsers propagate

    if (onlineUsersSeenByA.includes(userAId) && onlineUsersSeenByA.includes(userBId)) {
      pass(`Both users appear online: [${onlineUsersSeenByA.join(', ')}]`);
    } else {
      fail('Online presence', `online list: [${onlineUsersSeenByA.join(', ')}] — expected both users`);
    }

    // Now disconnect B — A should see B go offline
    socketB.disconnect();
    await wait(500);

    if (!onlineUsersSeenByA.includes(userBId)) {
      pass('Offline presence: userB correctly removed when disconnected');
    } else {
      fail('Offline presence', 'userB still appears online after disconnecting');
    }

    socketA.disconnect();
    resolve();
  });
}

// ── Test 7: Real-Time Message Delivery ──────────────────────────
async function testRealtimeMessages() {
  console.log('\n📋 TEST 7: Real-time message delivery (direct socket emit test)');

  // This tests that the Socket.IO server can emit to a specific socket ID.
  // Full message flow requires DB, so we test the socket layer here.
  return new Promise(async (resolve) => {
    const { Server } = require('socket.io');
    const { getIO } = require('./socket/socket');

    const io = getIO();
    if (!io) {
      fail('Real-time delivery', 'getIO() returned null — socket server not initialized');
      resolve();
      return;
    }

    const receiverUserId = 'test_receiver_ccc';
    const receiverSocket = ioClient(CHAT_URL, {
      transports: ['polling', 'websocket'],
      auth: { token: makeToken(receiverUserId) },
      reconnection: false,
    });

    let receivedMessage = null;

    receiverSocket.on('newMessage', (data) => {
      receivedMessage = data;
    });

    await new Promise((r) => {
      receiverSocket.on('connect', r);
      receiverSocket.on('connect_error', (e) => {
        fail('Message delivery: receiver connect', e.message);
        r();
      });
      setTimeout(r, 5000);
    });

    if (!receiverSocket.connected) {
      fail('Real-time delivery', 'receiver could not connect');
      receiverSocket.disconnect();
      resolve();
      return;
    }

    await wait(300);

    // Get the receiver's socket ID from the online users map
    const { getReceiverSocketIds } = require('./socket/socket');
    const socketIds = getReceiverSocketIds(receiverUserId);

    if (!socketIds || socketIds.length === 0) {
      fail('Real-time delivery', `receiver (${receiverUserId}) not found in userSocketMap`);
      receiverSocket.disconnect();
      resolve();
      return;
    }

    // Emit a test message to the receiver
    const testMsg = { _id: 'test123', text: 'Hello real-time!', senderId: 'test_sender', conversationId: 'conv123' };
    socketIds.forEach((sId) => io.to(sId).emit('newMessage', testMsg));

    await wait(500);

    if (receivedMessage && receivedMessage.text === 'Hello real-time!') {
      pass(`Message delivered in real-time: "${receivedMessage.text}"`);
    } else {
      fail('Real-time delivery', `message not received (got: ${JSON.stringify(receivedMessage)})`);
    }

    receiverSocket.disconnect();
    resolve();
  });
}

// ── Test 8: Reconnection ─────────────────────────────────────────
async function testReconnection() {
  console.log('\n📋 TEST 8: Automatic reconnection after disconnect');
  return new Promise(async (resolve) => {
    const userId = 'test_reconnect_ddd';
    let connectCount = 0;

    const socket = ioClient(CHAT_URL, {
      transports: ['polling', 'websocket'],
      auth: { token: makeToken(userId) },
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionAttempts: 3,
    });

    socket.on('connect', () => {
      connectCount++;
      if (connectCount === 1) {
        // Force disconnect to trigger reconnect
        socket.io.engine.close();
      } else if (connectCount === 2) {
        pass(`Reconnected successfully after forced disconnect (attempt ${connectCount})`);
        socket.disconnect();
        resolve();
      }
    });

    setTimeout(() => {
      if (connectCount < 2) {
        fail('Reconnection', `Only connected ${connectCount} time(s) — reconnect did not fire`);
        socket.disconnect();
        resolve();
      }
    }, 8000);
  });
}

// ── Run All Tests ────────────────────────────────────────────────
async function runAll() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  KubeChat Real-Time Test Suite');
  console.log(`  Server: ${CHAT_URL}`);
  console.log('═══════════════════════════════════════════════════');

  await testHealthCheck();
  await testPollingEndpoint();
  await testNoToken();
  await testBadToken();
  await testValidToken();
  await testPresence();
  await testRealtimeMessages();
  await testReconnection();

  console.log('\n═══════════════════════════════════════════════════');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('═══════════════════════════════════════════════════\n');

  process.exit(failed > 0 ? 1 : 0);
}

runAll().catch((e) => {
  console.error('Test suite crashed:', e);
  process.exit(1);
});
