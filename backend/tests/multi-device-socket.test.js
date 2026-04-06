/**
 * Advanced Multi-Device Socket.IO Integration Tests
 *
 * Covers:
 * 1. Invalid JWT rejects socket connection
 * 2. Multi-Device (Simulated Tabs): Alice connects 2 isolated sockets
 * 3. Cross-Device Payload: Bob sends message, BOTH of Alice's sockets receive the payload live
 * 4. Read Receipts: Alice hits /seen endpoint, Bob's socket receives 'messagesSeen' natively
 *
 * PREREQUISITES: Server running on port 5000
 */

const path = require("path");
const dotenv = require("dotenv");
dotenv.config({ path: path.join(__dirname, "../.env") });
const { io } = require("socket.io-client");

const BASE_HTTP = "http://localhost:5000/api";
const BASE_WS = "http://localhost:5000";
const UNIQUE = Date.now();

let passed = 0;
let failed = 0;

function assert(condition, label, details = "") {
  if (condition) {
    console.log(`  ✅ PASS: ${label}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: ${label} ${details}`);
    failed++;
  }
}

async function run() {
  console.log("\n🚀 Multi-Device Socket.IO Tests\n");

  const registerUser = async (email, name) => {
    const res = await fetch(`${BASE_HTTP}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password: "password123" }),
    });
    const data = await res.json();
    return { token: data.accessToken, id: data._id, name };
  };

  console.log("── Setup: Registering 2 test users ──");
  const alice = await registerUser(`alice_multi_${UNIQUE}@sockets.com`, "Multi Alice");
  const bob = await registerUser(`bob_multi_${UNIQUE}@sockets.com`, "Multi Bob");

  console.log("\n── Test 1: JWT Connection Security ──");
  const hackerSocket = io(BASE_WS, {
    auth: { token: "fake_invalid_token_123" },
    transports: ["websocket"],
  });

  let connectionRejected = false;
  await new Promise((resolve) => {
    hackerSocket.on("connect_error", (err) => {
      connectionRejected = true;
      assert(err.message.includes("Authentication"), "Hacker socket instantly rejected properly");
      hackerSocket.disconnect();
      resolve();
    });
    setTimeout(() => resolve(), 2000);
  });
  assert(connectionRejected, "Invalid token prevents socket handshake entirely");

  console.log("\n── Setup: Multi-Device Connect ──");
  // Alice logs in on her Laptop
  const aliceLaptopSocket = io(BASE_WS, {
    auth: { token: alice.token },
    transports: ["websocket"],
  });

  // Alice logs in on her Phone
  const alicePhoneSocket = io(BASE_WS, {
    auth: { token: alice.token },
    transports: ["websocket"],
  });

  // Bob logs in on his Computer
  const bobSocket = io(BASE_WS, {
    auth: { token: bob.token },
    transports: ["websocket"],
  });

  await new Promise((r) => setTimeout(r, 1000)); // wait for full handshake
  assert(aliceLaptopSocket.connected && alicePhoneSocket.connected, "Both of Alice's devices securely connected with same token");

  console.log("\n── Test 2: Cross-Device Payload Delivery ──");
  
  let aliceLaptopMsg = null;
  aliceLaptopSocket.on("newMessage", (msg) => { aliceLaptopMsg = msg; });

  let alicePhoneMsg = null;
  alicePhoneSocket.on("newMessage", (msg) => { alicePhoneMsg = msg; });

  // Bob sends HTTP Message to Alice
  const headers = {
    Authorization: `Bearer ${bob.token}`,
    "Content-Type": "application/json",
  };

  let res = await fetch(`${BASE_HTTP}/messages/${alice.id}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ text: "Ping multi-device!" }),
  });
  let dbMsg = await res.json();

  await new Promise((r) => setTimeout(r, 800)); // wait for socket emission delivery
  
  assert(aliceLaptopMsg !== null, "Alice's Laptop received the socket push live");
  assert(alicePhoneMsg !== null, "Alice's Phone ALSO received the exact same socket push live");
  if (aliceLaptopMsg && alicePhoneMsg) {
      assert(aliceLaptopMsg._id === dbMsg._id, "Laptop message payload maps correctly to MongoDB");
      assert(alicePhoneMsg._id === dbMsg._id, "Phone message payload maps correctly to MongoDB");
  }

  console.log("\n── Test 3: Live Read Receipts (isSeen) ──");

  let bobReadReceipt = null;
  bobSocket.on("messagesSeen", (payload) => { bobReadReceipt = payload; });

  // Alice opens the chat, which triggers the PUT /seen endpoint
  const conversationId = dbMsg.conversationId;
  res = await fetch(`${BASE_HTTP}/messages/${conversationId}/seen`, {
    method: "PUT",
    headers: {
        Authorization: `Bearer ${alice.token}`,
        "Content-Type": "application/json",
    }
  });
  
  assert(res.status === 200, "Alice successfully registers Read Receipt in DB");

  await new Promise((r) => setTimeout(r, 800));

  assert(bobReadReceipt !== null, "Bob instantly receives the 'messagesSeen' websocket event");
  if (bobReadReceipt) {
      assert(bobReadReceipt.conversationId === conversationId, "The Read Receipt payload contains the correct scope");
  }

  // Double check the DB update
  res = await fetch(`${BASE_HTTP}/messages/${conversationId}`, { headers });
  let history = await res.json();
  const theMsg = history.find(m => m._id === dbMsg._id);
  assert(theMsg && theMsg.isSeen === true, "Database successfully committed the 'isSeen: true' flag");

  // Cleanup
  aliceLaptopSocket.disconnect();
  alicePhoneSocket.disconnect();
  bobSocket.disconnect();

  console.log("\n════════════════════════════════════════");
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log("════════════════════════════════════════\n");

  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error("🚨 CRITICAL:", err);
  process.exit(1);
});
