/**
 * Security & Robustness Tests - Chat Application
 *
 * Covers:
 * 1. JWT Payload Validation
 * 2. Middleware Verification (DB Check)
 * 3. Token Expiry Check
 * 4. Invalid Token Format Check
 * 5. Rate Limiting Protection (429)
 * 6. Input Validation (Joi)
 * 7. Duplicate User Protection
 * 8. Password Exposure Prevention
 *
 * PREREQUISITES:
 * - Server must be running on port 5000
 * - MongoDB must be running locally
 */

const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");

// Load env to connect to DB internally for testing the "deleted user" case and generating short-lived tokens
dotenv.config({ path: path.join(__dirname, "../.env") });

const BASE_URL = "http://localhost:5000/api/auth";

// Unique test credentials
const TEST_EMAIL = `sec_${Date.now()}@example.com`;
const TEST_PASSWORD = "StrongPassword123!";
let authToken = "";
let userId = "";

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

// Ensure the process exits aggressively if a critical test fails unexpectedly
function criticalPanic(err) {
  console.log(`\n🚨 CRITICAL FAILURE 🚨`);
  console.error(err);
  process.exit(1);
}

async function runSecurityTests() {
  console.log("\n🛡️ Running Security & Robustness Tests\n");

  try {
    // ──────────────────────────────────────────────
    // Test 6 & 7: Input Validation & Duplicate Users
    // ──────────────────────────────────────────────
    console.log("── Test: Input Validation (Joi) ──");
    
    // Bad Email Format
    let res = await fetch(`${BASE_URL}/register`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Bad", email: "not-an-email", password: TEST_PASSWORD }),
    });
    assert(res.status === 400, "Invalid email format rejected with 400");

    // Short Password
    res = await fetch(`${BASE_URL}/register`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Short", email: `test_${Date.now()}@example.com`, password: "123" }),
    });
    assert(res.status === 400, "Password < 6 chars rejected with 400");

    // Valid Registration
    res = await fetch(`${BASE_URL}/register`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Security Tester", email: TEST_EMAIL, password: TEST_PASSWORD }),
    });
    const data = await res.json();
    assert(res.status === 201, "Valid registration succeeds");
    authToken = data.token;
    userId = data._id;

    // Duplicate Registration
    res = await fetch(`${BASE_URL}/register`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Duplicate", email: TEST_EMAIL, password: TEST_PASSWORD }),
    });
    assert(res.status === 400, "Duplicate email explicitly rejected with 400");


    // ──────────────────────────────────────────────
    // Test 1: JWT Payload Validation
    // ──────────────────────────────────────────────
    console.log("\n── Test: JWT Payload Constraints ──");
    // Decode without signature validation just to inspect payload structure
    const decoded = jwt.decode(authToken);
    assert(decoded !== null, "Token successfully decoded locally");
    assert(decoded.id === userId, "Payload contains correct user ID");
    assert(decoded.email === TEST_EMAIL, "Payload contains user Email");


    // ──────────────────────────────────────────────
    // Test 8: Password Exposure 
    // ──────────────────────────────────────────────
    console.log("\n── Test: Password Leak Prevention ──");
    res = await fetch(`${BASE_URL}/me`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const meData = await res.json();
    assert(res.status === 200, "GET /me fetches correctly");
    assert(meData.password === undefined, "Password is automatically stripped from response");


    // ──────────────────────────────────────────────
    // Test 4: Invalid Token Format
    // ──────────────────────────────────────────────
    console.log("\n── Test: Malformed Token Handling ──");
    
    // No token
    res = await fetch(`${BASE_URL}/me`);
    assert(res.status === 401, "No token returns 401");

    // Random string
    res = await fetch(`${BASE_URL}/me`, { headers: { Authorization: `Bearer abcxyz123` } });
    assert(res.status === 401, "Complete gibberish token returns 401");

    // Malformed correct format
    res = await fetch(`${BASE_URL}/me`, { headers: { Authorization: `Bearer abc.def` } });
    assert(res.status === 401, "Malformed two-part token returns 401");


    // ──────────────────────────────────────────────
    // Test 3: Token Expiry
    // ──────────────────────────────────────────────
    console.log("\n── Test: Token Expiry Check ──");
    if (!process.env.JWT_SECRET) {
      console.log("  ⚠️ Skipping Expiry Test: No custom JWT_SECRET found in relative .env");
    } else {
      // Forge a 3-second token
      const expiringToken = jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '3s' });
      
      console.log("  ⏳ Waiting 4 seconds for forged token to expire...");
      await new Promise(r => setTimeout(r, 4000));

      res = await fetch(`${BASE_URL}/me`, { headers: { Authorization: `Bearer ${expiringToken}` } });
      assert(res.status === 401, "Expired token actively rejected with 401");
    }


    // ──────────────────────────────────────────────
    // Test 5: Rate Limiting
    // ──────────────────────────────────────────────
    console.log("\n── Test: Brute Force Rate Limiting ──");
    let hitLimit = false;
    let limitStatusCode = 200;
    
    // Configured for 5 hits per min. So we hit 6 times.
    for(let i=0; i<6; i++) {
      const response = await fetch(`${BASE_URL}/login`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: TEST_EMAIL, password: "WrongPassword" }),
      });
      limitStatusCode = response.status;
      if (response.status === 429) hitLimit = true;
    }
    assert(hitLimit === true, `Rate Limiter triggered 429 after 5 failed attempts (Last received: ${limitStatusCode})`);


    // ──────────────────────────────────────────────
    // Test 2: Middleware Verification (Ghost Account)
    // ──────────────────────────────────────────────
    console.log("\n── Test: DB Verification over Token Trust ──");
    if (!process.env.MONGO_URI) {
      console.log("  ⚠️ Skipping DB Check Test: No custom MONGO_URI found in relative .env");
    } else {
      await mongoose.connect(process.env.MONGO_URI);
      
      // Manually delete the user out from under the server
      await mongoose.connection.db.collection('users').deleteOne({ _id: new mongoose.Types.ObjectId(userId) });
      console.log("  💀 User document manually deleted from database");

      // Verify the server doesn't blindly trust the token and requires the DB record
      res = await fetch(`${BASE_URL}/me`, { headers: { Authorization: `Bearer ${authToken}` } });
      assert(res.status === 401, "Valid token but deleted user reliably returns 401");
      
      await mongoose.disconnect();
    }

    console.log("\n════════════════════════════════════════");
    console.log(`  Security Results: ${passed} passed, ${failed} failed`);
    console.log("════════════════════════════════════════\n");

    process.exit(failed > 0 ? 1 : 0);

  } catch (err) {
    criticalPanic(err);
  }
}

runSecurityTests();
