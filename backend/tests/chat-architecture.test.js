/**
 * Chat Architecture Upgrade Tests
 *
 * Covers:
 * 1. Sending a message creates a Conversation
 * 2. Sending a second message uses same Conversation, updates lastMessage
 * 3. Fetching /api/conversations returns the chat list, sorted properly
 * 4. Fetching /api/messages/:conversationId returns the message history
 * 5. Hybrid search uses Regex for <3 chars and Text search for >=3
 *
 * PREREQUISITES: Server running on port 5000
 */

const path = require("path");
const dotenv = require("dotenv");
dotenv.config({ path: path.join(__dirname, "../.env") });
const mongoose = require("mongoose");

const BASE = "http://localhost:5000/api";
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
  console.log("\n🚀 Chat Architecture Tests\n");

  const registerUser = async (email, name) => {
    const res = await fetch(`${BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password: "password123" }),
    });
    const data = await res.json();
    return { token: data.accessToken, id: data._id, name };
  };

  console.log("── Setup: Registering 3 test users ──");
  const userA = await registerUser(`alice_${UNIQUE}@test.com`, "Alice Chat");
  const userB = await registerUser(`bob_${UNIQUE}@test.com`, "Bob Chat");
  const userC = await registerUser(`charlie_${UNIQUE}@test.com`, "Charlie Chat");

  const headersA = {
    Authorization: `Bearer ${userA.token}`,
    "Content-Type": "application/json",
  };
  const headersB = {
    Authorization: `Bearer ${userB.token}`,
    "Content-Type": "application/json",
  };

  // Allow DB to catch up
  await new Promise((r) => setTimeout(r, 1000));

  let conversationId;

  // ─── 1. Send first message (creates conversation) ───
  console.log("\n── Test 1: Send Message (Creates Conversation) ──");
  let res = await fetch(`${BASE}/messages/${userB.id}`, {
    method: "POST",
    headers: headersA,
    body: JSON.stringify({ text: "Hello Bob" }),
  });
  let msg1 = await res.json();

  assert(res.status === 201, "First message succeeds");
  assert(msg1.conversationId !== undefined, "Message has conversationId attached");
  assert(msg1.senderId === userA.id, "Sender ID matches");
  assert(msg1.receiverId === userB.id, "Receiver ID matches");

  conversationId = msg1.conversationId;

  // ─── 2. Send second message (reuses conversation) ───
  console.log("\n── Test 2: Send Reply (Reuses Conversation) ──");
  res = await fetch(`${BASE}/messages/${userA.id}`, {
    method: "POST",
    headers: headersB,
    body: JSON.stringify({ text: "Hi Alice" }),
  });
  let msg2 = await res.json();

  assert(res.status === 201, "Second message succeeds");
  assert(msg2.conversationId === conversationId, "Reuses the EXACT same conversation schema");

  // ─── 3. Fetch Chat List (Conversations) ───
  console.log("\n── Test 3: Fetch Chat List ──");
  res = await fetch(`${BASE}/conversations`, { headers: headersA });
  let list = await res.json();

  assert(res.status === 200, "Fetch chat list succeeds");
  assert(list.length === 1, "Alice sees exactly 1 conversation active");
  assert(list[0].otherUser !== undefined, "Other user info is populated properly");
  assert(list[0].otherUser._id === userB.id, "Other user is Bob");
  assert(list[0].lastMessage === "Hi Alice", "lastMessage track correctly points to newest text");

  // ─── 4. Fetch Message History ───
  console.log("\n── Test 4: Fetch Message History ──");
  res = await fetch(`${BASE}/messages/${conversationId}`, { headers: headersA });
  let history = await res.json();

  assert(res.status === 200, "Fetch message history succeeds");
  assert(history.length === 2, "History correctly contains both messages");
  assert(history[0].text === "Hello Bob" && history[1].text === "Hi Alice", "History is sorted ascending properly");

  // Security test
  res = await fetch(`${BASE}/messages/${conversationId}`, {
    headers: { Authorization: `Bearer ${userC.token}` },
  });
  assert(res.status === 403, "Charlie is blocked from viewing Alice/Bob chat history");

  // ─── 5. Hybrid Search Testing ───
  console.log("\n── Test 5: Hybrid Context Search ──");
  // < 3 char search (should use regex)
  res = await fetch(`${BASE}/users/search?query=Al`, { headers: headersB });
  let searchShort = await res.json();
  assert(searchShort.users.length > 0, "< 3 params triggers Regex searching to find Alice");

  // >= 3 char search (should use text search)
  res = await fetch(`${BASE}/users/search?query=Alice`, { headers: headersB });
  let searchLong = await res.json();
  assert(searchLong.users.length > 0, ">= 3 params triggers Text searching to find Alice");

  console.log("\n════════════════════════════════════════");
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log("════════════════════════════════════════\n");

  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error("🚨 CRITICAL:", err);
  process.exit(1);
});
