/**
 * User Search Optimization Tests
 *
 * Covers:
 * 1. Pagination on GET /api/users
 * 2. $text index search on GET /api/users/search
 * 3. Pagination on GET /api/users/search
 * 4. TextScore relevance sorting
 *
 * PREREQUISITES: Server running on port 5000
 */

const path = require("path");
const dotenv = require("dotenv");
dotenv.config({ path: path.join(__dirname, "../.env") });

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
  console.log("\n🚀 User Search Optimization Tests\n");

  // ─── Setup: Register 5 users for pagination testing ───
  console.log("── Setup: Registering 5 test users ──");

  const authHeader = async (email, name) => {
    const res = await fetch(`${BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password: "password123" }),
    });
    const data = await res.json();
    return { Authorization: `Bearer ${data.accessToken}` };
  };

  const headersA = await authHeader(`smith_${UNIQUE}@company.com`, "John Smith");
  await authHeader(`doe_${UNIQUE}@company.com`, "Jane Doe");
  await authHeader(`smithson_${UNIQUE}@company.com`, "Jack Smithson");
  await authHeader(`agent_${UNIQUE}@matrix.com`, "Agent Smith");
  await authHeader(`bob_${UNIQUE}@matrix.com`, "Bob Builder");

  // Allow Mongo indexing to catch up if needed
  await new Promise(r => setTimeout(r, 1000));

  // ─── 1. Pagination on GET All Users ───
  console.log("\n── Test 1: Pagination on /api/users ──");
  let res = await fetch(`${BASE}/users?page=1&limit=2`, { headers: headersA });
  let data = await res.json();

  assert(res.status === 200, "GET /api/users returns 200");
  assert(data.users.length === 2, "Respects limit=2");
  assert(data.pagination.page === 1, "Returns correct page metadata");
  assert(data.pagination.limit === 2, "Returns correct limit metadata");
  assert(data.pagination.total >= 4, "Total count works (at least 4 excluding self)");

  res = await fetch(`${BASE}/users?page=2&limit=2`, { headers: headersA });
  let dataPage2 = await res.json();
  assert(dataPage2.users.length > 0, "Page 2 returns results");
  assert(data.users[0]._id !== dataPage2.users[0]._id, "Page 2 skips Page 1 items");

  // ─── 2. Text Search Validation ───
  console.log("\n── Test 2: Text Search on /api/users/search ──");
  
  // Note: MongoDB text search matches whole words. "Smith" should match John Smith, Agent Smith, but maybe not Smithson depending on stemming.
  res = await fetch(`${BASE}/users/search?query=Smith`, { headers: headersA });
  data = await res.json();
  
  assert(res.status === 200, "Text search returns 200");
  assert(data.users.length > 0, "Text search finds at least one result");
  
  // Verify relevance sorting (Agent Smith vs John Smith will be close, but they should be at the top)
  if (data.users.length > 0) {
    assert(data.users[0].score !== undefined, "Results include textScore meta");
    
    // Check if sorted descending by score
    let isSorted = true;
    for (let i = 1; i < data.users.length; i++) {
        if (data.users[i].score > data.users[i-1].score) isSorted = false;
    }
    assert(isSorted, "Results are sorted by relevance textScore");
  }

  // ─── 3. Search Pagination ───
  console.log("\n── Test 3: Pagination on Search ──");
  
  // Search for the domain to get multiple hits
  res = await fetch(`${BASE}/users/search?query=company&limit=1`, { headers: headersA });
  data = await res.json();
  
  assert(data.users.length === 1, "Search respects limit=1");
  assert(data.pagination.total >= 2, "Search total count is correct");

  // ─── Results ───
  console.log("\n════════════════════════════════════════");
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log("════════════════════════════════════════\n");

  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error("🚨 CRITICAL:", err);
  process.exit(1);
});
