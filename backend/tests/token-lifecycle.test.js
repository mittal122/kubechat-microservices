/**
 * Token Lifecycle Tests
 *
 * 1. Login returns both accessToken and refreshToken
 * 2. Access token works on protected route
 * 3. Expired access token returns { expired: true }
 * 4. Refresh endpoint returns new access token
 * 5. Invalid refresh token rejected
 * 6. Logout clears refresh token from DB
 * 7. Old refresh token unusable after logout
 * 8. Register also returns both tokens
 */

const jwt = require("jsonwebtoken");
const path = require("path");
const dotenv = require("dotenv");
dotenv.config({ path: path.join(__dirname, "../.env") });

const BASE = "http://localhost:5000/api/auth";
const UNIQUE = Date.now();

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { console.log(`  ✅ PASS: ${label}`); passed++; }
  else { console.log(`  ❌ FAIL: ${label}`); failed++; }
}

async function run() {
  console.log("\n🔄 Token Lifecycle Tests\n");

  // ─── Test 8: Register returns both tokens ───
  console.log("── Test: Register returns dual tokens ──");
  let res = await fetch(`${BASE}/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Token User", email: `token_${UNIQUE}@test.com`, password: "password123" }),
  });
  let data = await res.json();
  assert(res.status === 201, "Register succeeds");
  assert(typeof data.accessToken === "string", "Register returns accessToken");
  assert(typeof data.refreshToken === "string", "Register returns refreshToken");

  const regRefreshToken = data.refreshToken;

  // ─── Test 1: Login returns both tokens ───
  console.log("\n── Test: Login returns dual tokens ──");
  res = await fetch(`${BASE}/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `token_${UNIQUE}@test.com`, password: "password123" }),
  });
  data = await res.json();
  assert(res.status === 200, "Login succeeds");
  assert(typeof data.accessToken === "string", "Login returns accessToken");
  assert(typeof data.refreshToken === "string", "Login returns refreshToken");

  const accessToken = data.accessToken;
  const refreshToken = data.refreshToken;

  // ─── Test 2: Access token works ───
  console.log("\n── Test: Access token on protected route ──");
  res = await fetch(`${BASE}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  data = await res.json();
  assert(res.status === 200, "GET /me returns 200 with valid access token");
  assert(data.name === "Token User", "Returns correct user");

  // ─── Test 3: Expired access token ───
  console.log("\n── Test: Expired access token ──");
  const expiredToken = jwt.sign(
    { userId: data._id, email: `token_${UNIQUE}@test.com` },
    process.env.JWT_SECRET,
    { expiresIn: "1s" }
  );
  console.log("  ⏳ Waiting 2 seconds...");
  await new Promise(r => setTimeout(r, 2000));

  res = await fetch(`${BASE}/me`, {
    headers: { Authorization: `Bearer ${expiredToken}` },
  });
  data = await res.json();
  assert(res.status === 401, "Expired access token returns 401");
  assert(data.expired === true, "Response includes { expired: true } flag");

  // ─── Test 4: Refresh endpoint works ───
  console.log("\n── Test: Refresh endpoint ──");
  res = await fetch(`${BASE}/refresh`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  data = await res.json();
  assert(res.status === 200, "Refresh returns 200");
  assert(typeof data.accessToken === "string", "Refresh returns new accessToken");

  // Verify the new access token works
  res = await fetch(`${BASE}/me`, {
    headers: { Authorization: `Bearer ${data.accessToken}` },
  });
  assert(res.status === 200, "New access token works on /me");

  // ─── Test 5: Invalid refresh token ───
  console.log("\n── Test: Invalid refresh tokens ──");
  res = await fetch(`${BASE}/refresh`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: "completely.fake.token" }),
  });
  assert(res.status === 401, "Random string refresh token rejected");

  // Old register refresh token should no longer match (login overwrites it)
  res = await fetch(`${BASE}/refresh`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: regRefreshToken }),
  });
  assert(res.status === 401, "Old refresh token (from register) rejected after login");

  // ─── Test 6: Logout clears refresh token ───
  console.log("\n── Test: Logout ──");
  res = await fetch(`${BASE}/logout`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  data = await res.json();
  assert(res.status === 200, "Logout returns 200");
  assert(data.message === "Logged out successfully", "Logout message correct");

  // ─── Test 7: Refresh token unusable after logout ───
  console.log("\n── Test: Refresh token after logout ──");
  res = await fetch(`${BASE}/refresh`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  assert(res.status === 401, "Refresh token rejected after logout");

  // ─── Results ───
  console.log("\n════════════════════════════════════════");
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log("════════════════════════════════════════\n");

  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => { console.error("🚨 CRITICAL:", err); process.exit(1); });
