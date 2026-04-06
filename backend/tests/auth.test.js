/**
 * Authentication System - Integration Tests
 *
 * Prerequisites:
 *   1. MongoDB must be running locally
 *   2. Server must be running: npm run dev (or npm start)
 *
 * Usage:
 *   node tests/auth.test.js
 */

const BASE_URL = "http://localhost:5000/api/auth";

// Unique email for this test run to avoid collisions
const TEST_EMAIL = `testuser_${Date.now()}@example.com`;
const TEST_PASSWORD = "SecurePass123";
const TEST_NAME = "Test User";

let authToken = "";
let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: ${testName}`);
    failed++;
  }
}

async function runTests() {
  console.log("\n🧪 Running Authentication Tests\n");
  console.log(`   Test email: ${TEST_EMAIL}\n`);

  // ──────────────────────────────────────────────
  // Test 1: Register a new user
  // ──────────────────────────────────────────────
  console.log("── Test 1: Register ──");
  try {
    const res = await fetch(`${BASE_URL}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: TEST_NAME,
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      }),
    });
    const data = await res.json();
    assert(res.status === 201, "Status is 201");
    assert(data.token !== undefined, "Response contains token");
    assert(data.name === TEST_NAME, "Response contains correct name");
    assert(data.email === TEST_EMAIL.toLowerCase(), "Response contains correct email");
    assert(data.password === undefined, "Password is NOT in response");
    authToken = data.token;
  } catch (err) {
    console.log(`  ❌ FAIL: Register request failed — ${err.message}`);
    failed++;
  }

  // ──────────────────────────────────────────────
  // Test 2: Duplicate email should be rejected
  // ──────────────────────────────────────────────
  console.log("\n── Test 2: Duplicate Email ──");
  try {
    const res = await fetch(`${BASE_URL}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: TEST_NAME,
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      }),
    });
    const data = await res.json();
    assert(res.status === 400, "Status is 400 for duplicate email");
    assert(data.message !== undefined, "Error message is present");
  } catch (err) {
    console.log(`  ❌ FAIL: Duplicate email request failed — ${err.message}`);
    failed++;
  }

  // ──────────────────────────────────────────────
  // Test 3: Login with valid credentials
  // ──────────────────────────────────────────────
  console.log("\n── Test 3: Login (valid) ──");
  try {
    const res = await fetch(`${BASE_URL}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      }),
    });
    const data = await res.json();
    assert(res.status === 200, "Status is 200");
    assert(data.token !== undefined, "Response contains token");
    assert(data.password === undefined, "Password is NOT in response");
    authToken = data.token; // Use fresh token from login
  } catch (err) {
    console.log(`  ❌ FAIL: Login request failed — ${err.message}`);
    failed++;
  }

  // ──────────────────────────────────────────────
  // Test 4: Login with wrong password
  // ──────────────────────────────────────────────
  console.log("\n── Test 4: Login (invalid password) ──");
  try {
    const res = await fetch(`${BASE_URL}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: TEST_EMAIL,
        password: "WrongPassword999",
      }),
    });
    const data = await res.json();
    assert(res.status === 401, "Status is 401 for wrong password");
    assert(data.message !== undefined, "Error message is present");
  } catch (err) {
    console.log(`  ❌ FAIL: Invalid login request failed — ${err.message}`);
    failed++;
  }

  // ──────────────────────────────────────────────
  // Test 5: Get /me with valid token
  // ──────────────────────────────────────────────
  console.log("\n── Test 5: GET /me (with token) ──");
  try {
    const res = await fetch(`${BASE_URL}/me`, {
      method: "GET",
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const data = await res.json();
    assert(res.status === 200, "Status is 200");
    assert(data.name === TEST_NAME, "Correct user name returned");
    assert(data.email === TEST_EMAIL.toLowerCase(), "Correct email returned");
    assert(data.password === undefined, "Password is NOT in response");
  } catch (err) {
    console.log(`  ❌ FAIL: GET /me request failed — ${err.message}`);
    failed++;
  }

  // ──────────────────────────────────────────────
  // Test 6: Get /me WITHOUT token (should fail)
  // ──────────────────────────────────────────────
  console.log("\n── Test 6: GET /me (no token) ──");
  try {
    const res = await fetch(`${BASE_URL}/me`, {
      method: "GET",
    });
    const data = await res.json();
    assert(res.status === 401, "Status is 401 without token");
    assert(data.message !== undefined, "Error message is present");
  } catch (err) {
    console.log(`  ❌ FAIL: GET /me (no token) request failed — ${err.message}`);
    failed++;
  }

  // ──────────────────────────────────────────────
  // Test 7: Register with missing fields
  // ──────────────────────────────────────────────
  console.log("\n── Test 7: Register (missing fields) ──");
  try {
    const res = await fetch(`${BASE_URL}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "incomplete@example.com" }),
    });
    const data = await res.json();
    assert(res.status === 400, "Status is 400 for missing fields");
    assert(data.message !== undefined, "Error message is present");
  } catch (err) {
    console.log(`  ❌ FAIL: Missing fields request failed — ${err.message}`);
    failed++;
  }

  // ──────────────────────────────────────────────
  // Summary
  // ──────────────────────────────────────────────
  console.log("\n════════════════════════════════════");
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log("════════════════════════════════════\n");

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
