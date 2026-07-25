// =========================================================
// ThoMathClass — Cloud Functions
// =========================================================
// 2 functions:
//   claimProduct   (callable) — khách bấm "Mua ngay": nếu sản phẩm miễn phí
//                   thì cấp quyền ngay, nếu có giá thì tạo link thanh toán payOS
//   payosWebhook   (HTTP)     — payOS gọi vào đây khi có người chuyển khoản
//                   thành công, ta xác nhận đơn hàng + ghi nhận đã mua
//
// Trước khi deploy cần khai báo 3 secret lấy từ trang quản trị payOS:
//   firebase functions:secrets:set PAYOS_CLIENT_ID
//   firebase functions:secrets:set PAYOS_API_KEY
//   firebase functions:secrets:set PAYOS_CHECKSUM_KEY
// Sau đó deploy: firebase deploy --only functions
// =========================================================

const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const PayOS = require("@payos/node");

admin.initializeApp();
const db = admin.firestore();

const REGION = "asia-southeast1";

const payosClientId = defineSecret("PAYOS_CLIENT_ID");
const payosApiKey = defineSecret("PAYOS_API_KEY");
const payosChecksumKey = defineSecret("PAYOS_CHECKSUM_KEY");

function getPayOS() {
  return new PayOS(payosClientId.value(), payosApiKey.value(), payosChecksumKey.value());
}

// ---------------------------------------------------------
// claimProduct — gọi từ payment.js mỗi khi khách bấm mua
// ---------------------------------------------------------
exports.claimProduct = onCall(
  { region: REGION, secrets: [payosClientId, payosApiKey, payosChecksumKey], invoker: "public" },
  async (request) => {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError("unauthenticated", "Cần đăng nhập trước khi thao tác.");
    }
    const uid = auth.uid;
    const productId = request.data && request.data.productId;
    if (!productId || typeof productId !== "string") {
      throw new HttpsError("invalid-argument", "Thiếu productId.");
    }

    const productSnap = await db.collection("products").doc(productId).get();
    if (!productSnap.exists) {
      throw new HttpsError("not-found", "Sản phẩm không tồn tại.");
    }
    const product = productSnap.data();

    const purchaseRef = db
      .collection("members")
      .doc(uid)
      .collection("purchases")
      .doc(productId);

    // Đã mua/đã claim từ trước — không tạo đơn mới, không tính tiền lần 2
    const existingPurchase = await purchaseRef.get();
    if (existingPurchase.exists) {
      return { granted: true, alreadyOwned: true };
    }

    const amountVnd = Number(product.amountVnd) || 0;

    if (amountVnd <= 0) {
      await purchaseRef.set({
        title: product.title || "",
        category: product.category || "",
        amountVnd: 0,
        method: "free",
        purchasedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return { granted: true, alreadyOwned: false };
    }

    // Có giá cụ thể — tạo link thanh toán payOS
    const payos = getPayOS();
    const orderCode = Date.now();
    const returnUrl = (request.data && request.data.returnUrl) || "https://thomathclass.github.io/";
    const cancelUrl = (request.data && request.data.cancelUrl) || returnUrl;

    let paymentLink;
    try {
      paymentLink = await payos.createPaymentLink({
        orderCode,
        amount: amountVnd,
        description: ("TMC " + productId).slice(0, 25),
        returnUrl,
        cancelUrl,
      });
    } catch (err) {
      logger.error("payOS createPaymentLink lỗi:", err);
      throw new HttpsError("internal", "Không tạo được link thanh toán, thử lại sau.");
    }

    await db
      .collection("orders")
      .doc(String(orderCode))
      .set({
        uid,
        productId,
        productTitle: product.title || "",
        productCategory: product.category || "",
        amountVnd,
        status: "pending",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    return {
      granted: false,
      orderCode: String(orderCode),
      checkoutUrl: paymentLink.checkoutUrl,
      qrCode: paymentLink.qrCode,
    };
  }
);

// ---------------------------------------------------------
// payosWebhook — payOS gọi vào URL này khi có giao dịch thành công
// ---------------------------------------------------------
exports.payosWebhook = onRequest(
  { region: REGION, secrets: [payosClientId, payosApiKey, payosChecksumKey], invoker: "public" },
  async (req, res) => {
    try {
      const payos = getPayOS();
      const webhookData = payos.verifyPaymentWebhookData(req.body);
      const orderCode = String(webhookData.orderCode);

      const orderRef = db.collection("orders").doc(orderCode);
      const orderSnap = await orderRef.get();
      if (!orderSnap.exists) {
        logger.warn("payosWebhook: không tìm thấy order", orderCode);
        res.status(200).send("ok");
        return;
      }
      const order = orderSnap.data();
      if (order.status === "paid") {
        res.status(200).send("ok"); // đã xử lý trước đó, tránh ghi trùng
        return;
      }

      await orderRef.update({
        status: "paid",
        paidAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await db
        .collection("members")
        .doc(order.uid)
        .collection("purchases")
        .doc(order.productId)
        .set({
          title: order.productTitle || "",
          category: order.productCategory || "",
          amountVnd: order.amountVnd,
          method: "payos",
          orderCode,
          purchasedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

      res.status(200).send("ok");
    } catch (err) {
      logger.error("payosWebhook lỗi:", err);
      // vẫn trả 200 để payOS không lặp lại gửi vô hạn khi lỗi nằm ở phía mình
      res.status(200).send("ok");
    }
  }
);
