/**
 * Auth Fixes & User Discovery Tests
 *
 * Covers:
 * 1. JWT Payload uses `userId` key (not `id`)
 * 2. Token includes email
 * 3. Middleware uses DB fetch with `decoded.userId`
 * 4. Rate limiting on login (429)
 * 5. Joi input validation (400)
 * 6. GET /api/users excludes self
 * 7. GET /api/users/search partial match
 * 8. No token on /api/users → 401
 *
 * PREREQUISITES: Server running on port 5000
 */

const jwt = require("jsonwebtoken");
const path = require("path");
const dotenv = require("dotenv");
dotenv.config({ path: path.join(__dirname, "../.env") });

const BASE = "http://localhost:5000/api";
const UNIQUE = Date.now();

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { console.log(`  ✅ PASS: ${label}`); passed++; }
  else { console.log(`  ❌ FAIL: ${label}`); failed++; }
}

async function run() {
  console.log("\n🔬 Auth Fixes & User Discovery Tests\n");

  // ─── Setup: Register 2 users ───
  console.log("── Setup: Registering test users ──");

  const userA = await (await fetch(`${BASE}/auth/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Alice Tester", email: `alice_${UNIQUE}@test.com`, password: "password123" }),
  })).json();
  assert(userA.token, "User A registered");

  const userB = await (await fetch(`${BASE}/auth/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Bob Finder", email: `bob_${UNIQUE}@test.com`, password: "password123" }),
  })).json();
  assert(userB.token, "User B registered");

  // ─── 1. JWT Payload Key: userId ───
  console.log("\n── Test 1: JWT Payload Key ──");
  const decoded = jwt.decode(userA.token);
  assert(decoded.userId !== undefined, "Payload contains 'userId' key");
  assert(decoded.id === undefined, "Payload does NOT contain old 'id' key");
  assert(decoded.email === `alice_${UNIQUE}@test.com`, "Payload contains email");

  // ─── 2. Middleware DB Fetch ───
  console.log("\n── Test 2: Middleware DB Check ──");
  let res = await fetch(`${BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${userA.token}` },
  });
  let data = await res.json();
  assert(res.status === 200, "GET /me returns 200 with valid token");
  assert(data.name === "Alice Tester", "Returns correct user name");
  assert(data.password === undefined, "Password NOT exposed");

  // ─── 3. Joi Validation ───
  console.log("\n── Test 3: Joi Validation ──");
  res = await fetch(`${BASE}/auth/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "X", email: "bad-email", password: "123" }),
  });
  assert(res.status === 400, "Invalid email format rejected (400)");

  res = await fetch(`${BASE}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "not-email", password: "test" }),
  });
  assert(res.status === 400, "Login with invalid email rejected (400)");

  // ─── 4. Rate Limiting ───
  console.log("\n── Test 4: Rate Limiting ──");
  let hitLimit = false;
  for (let i = 0; i < 6; i++) {
    const r = await fetch(`${BASE}/auth/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `alice_${UNIQUE}@test.com`, password: "wrong" }),
    });
    if (r.status === 429) hitLimit = true;
  }
  assert(hitLimit, "Rate limiter returns 429 after 5 failed attempts");

  // ─── 5. GET /api/users (Exclude Self) ───
  console.log("\n── Test 5: Get All Users (Exclude Self) ──");
  res = await fetch(`${BASE}/users`, {
    headers: { Authorization: `Bearer ${userA.token}` },
  });
  const allUsers = await res.json();
  assert(res.status === 200, "GET /api/users returns 200");
  const selfInList = allUsers.some((u) => u._id === userA._id);
  assert(!selfInList, "Logged-in user (Alice) is NOT in the list");
  const bobInList = allUsers.some((u) => u.name === "Bob Finder");
  assert(bobInList, "Other user (Bob) IS in the list");

  // ─── 6. Search Users ───
  console.log("\n── Test 6: Search Users ──");
  res = await fetch(`${BASE}/users/search?query=Bob`, {
    headers: { Authorization: `Bearer ${userA.token}` },
  });
  const searchResults = await res.json();
  assert(res.status === 200, "GET /api/users/search returns 200");
  assert(searchResults.length >= 1, "Search finds at least 1 user");
  assert(searchResults[0].name === "Bob Finder", "Search finds Bob by name");

  // Partial email search
  res = await fetch(`${BASE}/users/search?query=bob_${UNIQUE}`, {
    headers: { Authorization: `Bearer ${userA.token}` },
  });
  const emailSearch = await res.json();
  assert(emailSearch.length >= 1, "Search by partial email works");

  // ─── 7. No Token on /api/users ───
  console.log("\n── Test 7: Unauthorized Access ──");
  res = await fetch(`${BASE}/users`);
  assert(res.status === 401, "GET /api/users with no token → 401");

  res = await fetch(`${BASE}/users/search?query=test`);
  assert(res.status === 401, "GET /api/users/search with no token → 401");

  // ─── 8. Empty/invalid search query ───
  console.log("\n── Test 8: Search Validation ──");
  res = await fetch(`${BASE}/users/search`, {
    headers: { Authorization: `Bearer ${userA.token}` },
  });
  assert(res.status === 400, "Search with no query param → 400");

  // ─── Results ───
  console.log("\n════════════════════════════════════════");
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log("════════════════════════════════════════\n");

  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => { console.error("🚨 CRITICAL:", err); process.exit(1); });
