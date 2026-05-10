// netlify/functions/lemon-webhook.js
// Handles two jobs:
//   1. POST /lemon-webhook  — LS webhook (order_created event) → store order in KV or log
//   2. GET  /lemon-webhook?order_id=xxx&email=yyy — verify order via LS API → return pro token

const crypto = require("crypto");

// ── helpers ──────────────────────────────────────────────────────────────────

function hmacToken(orderId) {
  // Deterministic Pro token: HMAC-SHA256(orderId, TOKEN_SECRET)
  // Stored in localStorage; checked client-side on every load.
  const secret = process.env.DDA_TOKEN_SECRET || "change_me_in_netlify_env";
  return crypto
    .createHmac("sha256", secret)
    .update(String(orderId))
    .digest("hex");
}

async function verifyOrderWithLS(orderId) {
  // Call LS API to confirm the order is paid
  const apiKey = process.env.LS_API_KEY; // set in Netlify env
  if (!apiKey) throw new Error("LS_API_KEY not set");

  const res = await fetch(`https://api.lemonsqueezy.com/v1/orders/${orderId}`, {
    headers: {
      Accept: "application/vnd.api+json",
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LS API ${res.status}: ${body}`);
  }

  const json = await res.json();
  const status = json?.data?.attributes?.status;
  return status === "paid"; // only "paid" orders unlock Pro
}

// ── main handler ─────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  // ── preflight ──
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: cors };
  }

  // ── webhook POST from Lemon Squeezy ──────────────────────────────────────
  if (event.httpMethod === "POST") {
    try {
      const sigHeader = event.headers["x-signature"] || "";
      const webhookSecret = process.env.LS_WEBHOOK_SECRET || "";

      // Verify HMAC signature (required in production)
      if (webhookSecret) {
        const expected = crypto
          .createHmac("sha256", webhookSecret)
          .update(event.body)
          .digest("hex");
        if (
          !crypto.timingSafeEqual(
            Buffer.from(sigHeader, "hex"),
            Buffer.from(expected, "hex")
          )
        ) {
          return {
            statusCode: 401,
            headers: cors,
            body: JSON.stringify({ error: "Invalid signature" }),
          };
        }
      }

      const payload = JSON.parse(event.body);
      const eventName = payload?.meta?.event_name;

      // We only care about order_created
      if (eventName !== "order_created") {
        return {
          statusCode: 200,
          headers: cors,
          body: JSON.stringify({ ok: true, ignored: eventName }),
        };
      }

      // Log the order (in production you'd write to a DB / KV store)
      const orderId = payload?.data?.id;
      const email = payload?.data?.attributes?.user_email;
      console.log(`[DDA] Pro order: orderId=${orderId} email=${email}`);

      return {
        statusCode: 200,
        headers: cors,
        body: JSON.stringify({ ok: true, orderId }),
      };
    } catch (err) {
      console.error("[DDA] webhook error:", err.message);
      return {
        statusCode: 500,
        headers: cors,
        body: JSON.stringify({ error: err.message }),
      };
    }
  }

  // ── GET: client-side verification after redirect ──────────────────────────
  // Called by the browser after LS redirects back with ?order_id=xxx
  if (event.httpMethod === "GET") {
    const { order_id } = event.queryStringParameters || {};

    if (!order_id) {
      return {
        statusCode: 400,
        headers: cors,
        body: JSON.stringify({ error: "order_id required" }),
      };
    }

    try {
      const paid = await verifyOrderWithLS(order_id);

      if (!paid) {
        return {
          statusCode: 402,
          headers: cors,
          body: JSON.stringify({ error: "Order not paid" }),
        };
      }

      const token = hmacToken(order_id);

      return {
        statusCode: 200,
        headers: cors,
        body: JSON.stringify({ ok: true, token, orderId: order_id }),
      };
    } catch (err) {
      console.error("[DDA] verify error:", err.message);
      return {
        statusCode: 500,
        headers: cors,
        body: JSON.stringify({ error: err.message }),
      };
    }
  }

  return {
    statusCode: 405,
    headers: cors,
    body: JSON.stringify({ error: "Method not allowed" }),
  };
};