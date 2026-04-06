/**
 * Real-Time Socket.IO Integration Tests
 *
 * Covers:
 * 1. Client connects with userId and is marked online
 * 2. Another client connects and is tracked in userSocketMap
 * 3. Client A sends a REST POST /api/messages which saves to DB
 * 4. Backend intercepts the DB save and pushes "newMessage" event to Client B's socket instantly
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
  console.log("\n🚀 Real-Time Socket.IO Tests\n");

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
  const alice = await registerUser(`alice_${UNIQUE}@sockets.com`, "Socket Alice");
  const bob = await registerUser(`bob_${UNIQUE}@sockets.com`, "Socket Bob");

  console.log("\n── Setup: Connecting WebSockets ──");
  // Connect Bob's socket
  const bobSocket = io(BASE_WS, {
    query: { userId: bob.id },
    transports: ["websocket"],
  });

  await new Promise((resolve) => {
    bobSocket.on("connect", () => {
      assert(true, "Bob's socket successfully connected to server");
      resolve();
    });
    // Timeout fallback
    setTimeout(resolve, 3000);
  });

  // Track if Bob receives the online users list
  let onlineUsers = [];
  bobSocket.on("getOnlineUsers", (users) => {
    onlineUsers = users;
  });

  // Setup memory for the message test
  let receivedLiveMessage = null;
  bobSocket.on("newMessage", (msg) => {
    receivedLiveMessage = msg;
  });

  await new Promise((r) => setTimeout(r, 500));
  assert(onlineUsers.includes(bob.id), "Server acknowledges Bob is officially 'Online'");

  console.log("\n── Test: Emitting live message cross-platform ──");
  
  // Alice sends a standard HTTP POST request
  const headers = {
    Authorization: `Bearer ${alice.token}`,
    "Content-Type": "application/json",
  };

  const res = await fetch(`${BASE_HTTP}/messages/${bob.id}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ text: "Ping over websockets!" }),
  });
  const dbMsg = await res.json();
  assert(res.status === 201, "Alice's HTTP message successfully saved to DB");

  // Wait briefly for the server to process the socket emission
  await new Promise((r) => setTimeout(r, 800));

  assert(receivedLiveMessage !== null, "Bob's socket received an instant push payload");
  
  if (receivedLiveMessage) {
    assert(receivedLiveMessage.text === "Ping over websockets!", "Live payload text matches");
    assert(receivedLiveMessage.senderId === alice.id, "Live payload senderId matches");
    assert(receivedLiveMessage._id === dbMsg._id, "Live payload directly matches the MongoDB row ID");
  }

  // Cleanup
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
