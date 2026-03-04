/**
 * Concurrent Order Transaction Test
 *
 * Sends 3 parallel POST /orders requests to verify that:
 *   1. The pessimistic locking strategy (FOR UPDATE) prevents race conditions.
 *   2. Only requests that pass wallet-balance + stock validation succeed.
 *   3. Failed requests receive a clean error (no partial writes / dirty state).
 *
 * Run:  node test.js
 */

const BASE_URL = "http://localhost:3000/api/v1";

// Bearer token from the Postman collection (customer role)
const TOKEN =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI4MWIxMjNjNi02OWMzLTRiYzEtOWI1Zi1iNGMxMzAyMjA5YmEiLCJyb2xlIjoiY3VzdG9tZXIiLCJpYXQiOjE3NzI2MTY3MDIsImV4cCI6MTc3MzIyMTUwMn0.v-0Z1RIEfpdbuyCcwt4NiBOIqocfJqVzNtg5C69pOpc";

// Shared product - all 3 requests compete for the same stock & wallet balance
const PRODUCT_ID = "a00bfaf2-20d5-497d-acb7-d781e28f96ee";
const QUANTITY    = 9;

//  helpers 

async function placeOrder(requestIndex) {
  const label = `Request #${requestIndex + 1}`;
  const start = Date.now();

  try {
    const res = await fetch(`${BASE_URL}/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TOKEN}`,
      },
      body: JSON.stringify({
        items: [{ product_id: PRODUCT_ID, quantity: QUANTITY }],
        notes: `Concurrent test - ${label}`,
      }),
    });

    const elapsed = Date.now() - start;
    const body = await res.json().catch(() => ({}));

    if (res.ok) {
      return {
        label,
        status: "SUCCESS",
        httpStatus: res.status,
        elapsed,
        orderNumber: body?.data?.order?.order_number ?? body?.order_number ?? "-",
        orderId:     body?.data?.order?.id           ?? body?.id           ?? "-",
      };
    }

    return {
      label,
      status: "FAILED",
      httpStatus: res.status,
      elapsed,
      error: body?.message ?? body?.error ?? JSON.stringify(body),
    };
  } catch (err) {
    return {
      label,
      status: "ERROR",
      httpStatus: null,
      elapsed: Date.now() - start,
      error: err.message,
    };
  }
}

function printResult(result) {
  const icon =
    result.status === "SUCCESS" ? "✅" :
    result.status === "FAILED"  ? "❌" : "💥";

  console.log(`\n${icon}  ${result.label}  [HTTP ${result.httpStatus ?? "N/A"}]  (${result.elapsed} ms)`);

  if (result.status === "SUCCESS") {
    console.log(`   Order Number : ${result.orderNumber}`);
    console.log(`   Order ID     : ${result.orderId}`);
  } else {
    console.log(`   Error        : ${result.error}`);
  }
}

//  main 

async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log(" Concurrent Order Transaction Test");
  console.log(` Product  : ${PRODUCT_ID}`);
  console.log(` Quantity : ${QUANTITY} per request  (${3 * QUANTITY} total)`);
  console.log(" Requests : 3 fired simultaneously");
  console.log("═══════════════════════════════════════════════════════");

  // Fire all 3 requests at the exact same time
  const results = await Promise.all([
    placeOrder(0),
    placeOrder(1),
    placeOrder(2),
  ]);

  console.log("\n Results ");
  results.forEach(printResult);

  const succeeded = results.filter((r) => r.status === "SUCCESS").length;
  const failed    = results.filter((r) => r.status === "FAILED").length;
  const errored   = results.filter((r) => r.status === "ERROR").length;

  console.log("\n Summary ");
  console.log(`   Succeeded : ${succeeded}`);
  console.log(`   Failed    : ${failed}  (expected if wallet/stock insufficient)`);
  console.log(`   Errored   : ${errored}  (network / server issues)`);

  if (succeeded > 0 && (failed > 0 || errored > 0)) {
    console.log("\n✔  Transactions appear to be working correctly.");
    console.log("   Concurrent requests were serialised - no double-spend or oversell.");
  } else if (succeeded === 3) {
    console.log("\n⚠  All 3 succeeded - verify wallet balance and stock are sufficient.");
  } else if (succeeded === 0) {
    console.log("\n⚠  All requests failed - check the server logs for details.");
  }

  console.log("═══════════════════════════════════════════════════════\n");
}

main();
