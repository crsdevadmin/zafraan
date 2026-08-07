"use strict";

const crypto = require("node:crypto");
const {initializeApp} = require("firebase-admin/app");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params");
const Razorpay = require("razorpay");

initializeApp();

const db = getFirestore();
const razorpayKeyId = defineSecret("RAZORPAY_KEY_ID");
const razorpayKeySecret = defineSecret("RAZORPAY_KEY_SECRET");
const region = "asia-south1";

function requireAuth(request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Please sign in before paying.");
  }
  return request.auth.uid;
}

function parsePositiveInteger(value, field, maximum) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > maximum) {
    throw new HttpsError("invalid-argument", `${field} is invalid.`);
  }
  return number;
}

function numericPrice(value) {
  const number = Number(String(value ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function sizeAmount(size) {
  const match = String(size).toLowerCase().match(/(\d+(?:\.\d+)?)\s*(kg|g)/);
  if (!match) return null;
  const amount = Number(match[1]);
  return match[2] === "kg" ? amount * 1000 : amount;
}

function unitPrice(product, requestedSize) {
  const allowedSizes = String(product.sizes || "")
      .split("/")
      .map((size) => size.trim())
      .filter(Boolean);
  if (!allowedSizes.includes(requestedSize)) {
    throw new HttpsError("failed-precondition", "A selected product size is unavailable.");
  }

  const basePrice = numericPrice(product.price);
  if (!basePrice) {
    throw new HttpsError("failed-precondition", "A selected product has no valid price.");
  }

  const grams = sizeAmount(requestedSize);
  return grams ? Math.round((basePrice * grams) / 100) : basePrice;
}

async function canonicalCart(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length < 1 || rawItems.length > 40) {
    throw new HttpsError("invalid-argument", "The cart is empty or too large.");
  }

  const requested = rawItems.map((item) => ({
    id: parsePositiveInteger(item.id, "Product", 1000000),
    size: String(item.size || "").trim(),
    qty: parsePositiveInteger(item.qty, "Quantity", 20),
  }));
  const refs = requested.map((item) => db.collection("productCatalog").doc(String(item.id)));
  const snapshots = await db.getAll(...refs);

  return requested.map((item, index) => {
    const snapshot = snapshots[index];
    if (!snapshot.exists) {
      throw new HttpsError(
          "failed-precondition",
          `Product ${item.id} is not configured in the server catalog.`,
      );
    }
    const product = snapshot.data();
    if (product.visible === false || product.outOfStock === true) {
      throw new HttpsError("failed-precondition", "A selected product is unavailable.");
    }
    const price = unitPrice(product, item.size);
    return {
      id: item.id,
      name: String(product.name || `Product ${item.id}`).slice(0, 120),
      size: item.size,
      qty: item.qty,
      price,
      cat: String(product.cat || "").slice(0, 80),
      prepTime: String(product.prepTime || "").slice(0, 40),
    };
  });
}

function preparationMinutesFromText(value) {
  const text = String(value || "").trim().toLowerCase();
  const hours = text.match(/(\d+(?:\.\d+)?)\s*(?:hour|hr)/);
  if (hours) return Math.max(0, Math.round(Number(hours[1]) * 60));
  const minutes = text.match(/(\d+)\s*(?:minute|min)/);
  return minutes ? Math.max(0, Number(minutes[1])) : 0;
}

function preparationMinutesForItems(items) {
  let longest = 0;
  let preparedItems = 0;
  for (const item of items) {
    const requiresPreparation = ["Peeled Veg", "Cut Vegetables", "Packs"].includes(item.cat);
    if (requiresPreparation) preparedItems += 1;
    longest = Math.max(
        longest,
        preparationMinutesFromText(item.prepTime) || (requiresPreparation ? 30 : 0),
    );
  }
  if (preparedItems > 1) longest = Math.min(60, Math.max(longest, 30 + (preparedItems - 1) * 10));
  return Math.min(60, Math.max(0, longest));
}

function razorpayClient() {
  return new Razorpay({
    key_id: razorpayKeyId.value(),
    key_secret: razorpayKeySecret.value(),
  });
}

exports.createRazorpayOrder = onCall(
    {
      region,
      secrets: [razorpayKeyId, razorpayKeySecret],
      enforceAppCheck: false,
    },
    async (request) => {
      const uid = requireAuth(request);
      const items = await canonicalCart(request.data?.items);
      const deliveryAddress = String(request.data?.deliveryAddress || "").trim().slice(0, 500);
      if (deliveryAddress.length < 8) {
        throw new HttpsError("invalid-argument", "A valid delivery address is required.");
      }
      const rawLocation = request.data?.deliveryLocation;
      const deliveryLocation = rawLocation &&
        Number.isFinite(Number(rawLocation.lat)) &&
        Number.isFinite(Number(rawLocation.lng)) ?
        {lat: Number(rawLocation.lat), lng: Number(rawLocation.lng)} :
        null;

      const userSnapshot = await db.collection("users").doc(uid).get();
      if (!userSnapshot.exists) {
        throw new HttpsError("failed-precondition", "Customer profile was not found.");
      }
      const user = userSnapshot.data();
      const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
      const deliveryCharge = subtotal >= 100 ? 0 : 10;
      const availableCoins = Math.max(0, Number(user.coins) || 0);
      const requestedCoins = Math.max(0, Math.floor(Number(request.data?.coinsRequested) || 0));
      const coinsUsed = Math.min(requestedCoins, availableCoins, subtotal + deliveryCharge);
      const total = subtotal + deliveryCharge - coinsUsed;
      if (!Number.isInteger(total) || total < 1) {
        throw new HttpsError("failed-precondition", "The payable amount must be at least ₹1.");
      }

      const receipt = `ZAF-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
      const razorpayOrder = await razorpayClient().orders.create({
        amount: total * 100,
        currency: "INR",
        receipt,
        notes: {uid},
      });

      await db.collection("paymentIntents").doc(razorpayOrder.id).set({
        uid,
        receipt,
        items,
        subtotal,
        deliveryCharge,
        coinsUsed,
        totalPrice: total,
        customerName: String(user.name || "").slice(0, 120),
        customerPhone: String(user.phone || "").slice(0, 30),
        deliveryAddress,
        deliveryLocation,
        referralCodeUsed: String(user.referredBy || "").slice(0, 40),
        amountPaise: razorpayOrder.amount,
        currency: "INR",
        status: "created",
        createdAt: FieldValue.serverTimestamp(),
      });

      return {
        keyId: razorpayKeyId.value(),
        razorpayOrderId: razorpayOrder.id,
        amount: razorpayOrder.amount,
        receipt,
      };
    },
);

exports.verifyRazorpayPayment = onCall(
    {
      region,
      secrets: [razorpayKeyId, razorpayKeySecret],
      enforceAppCheck: false,
    },
    async (request) => {
      const uid = requireAuth(request);
      const razorpayOrderId = String(request.data?.razorpayOrderId || "");
      const razorpayPaymentId = String(request.data?.razorpayPaymentId || "");
      const razorpaySignature = String(request.data?.razorpaySignature || "");
      if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
        throw new HttpsError("invalid-argument", "Payment verification details are missing.");
      }

      const expectedSignature = crypto
          .createHmac("sha256", razorpayKeySecret.value())
          .update(`${razorpayOrderId}|${razorpayPaymentId}`)
          .digest("hex");
      const supplied = Buffer.from(razorpaySignature, "utf8");
      const expected = Buffer.from(expectedSignature, "utf8");
      if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
        throw new HttpsError("permission-denied", "The Razorpay signature is invalid.");
      }

      const payment = await razorpayClient().payments.fetch(razorpayPaymentId);
      const intentRef = db.collection("paymentIntents").doc(razorpayOrderId);
      const intentSnapshot = await intentRef.get();
      if (!intentSnapshot.exists) {
        throw new HttpsError("not-found", "The payment order was not found.");
      }
      const intent = intentSnapshot.data();
      if (
        intent.uid !== uid ||
        payment.order_id !== razorpayOrderId ||
        Number(payment.amount) !== Number(intent.amountPaise) ||
        payment.currency !== "INR" ||
        !["captured", "authorized"].includes(payment.status)
      ) {
        throw new HttpsError("failed-precondition", "The payment does not match this order.");
      }

      const orderId = intent.receipt;
      const orderRef = db.collection("orders").doc(orderId);
      const userRef = db.collection("users").doc(uid);
      const deliveryOtp = String(crypto.randomInt(1000, 10000));
      const createdAt = new Date().toISOString();
      const preparationMinutes = preparationMinutesForItems(intent.items);
      const estimatedReadyAt = new Date(Date.now() + preparationMinutes * 60000).toISOString();

      const order = {
        orderId,
        customerName: intent.customerName,
        customerPhone: intent.customerPhone,
        deliveryAddress: intent.deliveryAddress,
        deliveryLocation: intent.deliveryLocation || null,
        items: intent.items,
        totalPrice: intent.totalPrice,
        deliveryCharge: intent.deliveryCharge,
        coinsUsed: intent.coinsUsed,
        userId: uid,
        referralCodeUsed: intent.referralCodeUsed,
        deliveryOtp,
        paymentMethod: "Razorpay (Online)",
        razorpayOrderId,
        razorpayPaymentId,
        preparationMinutes,
        estimatedReadyAt,
        status: "Preparing",
        createdAt,
      };

      await db.runTransaction(async (transaction) => {
        const latestIntentSnapshot = await transaction.get(intentRef);
        const latestIntent = latestIntentSnapshot.data();
        if (latestIntent.status === "verified") return;

        const existingOrder = await transaction.get(orderRef);
        const userSnapshot = intent.coinsUsed > 0 ? await transaction.get(userRef) : null;
        if (!existingOrder.exists) {
          if (intent.coinsUsed > 0) {
            const currentCoins = Math.max(0, Number(userSnapshot.data()?.coins) || 0);
            if (currentCoins < intent.coinsUsed) {
              throw new HttpsError("failed-precondition", "Coin balance changed before payment completed.");
            }
            transaction.update(userRef, {coins: FieldValue.increment(-intent.coinsUsed)});
          }
          transaction.set(orderRef, order);
        }
        transaction.update(intentRef, {
          status: "verified",
          razorpayPaymentId,
          verifiedAt: FieldValue.serverTimestamp(),
        });
      });

      const savedOrder = await orderRef.get();
      return {order: savedOrder.data() || order};
    },
);
