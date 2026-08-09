// =========================================================
// ThoMathClass — Cloud Functions
// =========================================================
// 4 functions:
//   claimProduct          (callable)  — khách bấm "Mua ngay": nếu sản phẩm miễn phí
//                          thì cấp quyền ngay, nếu có giá thì tạo link thanh toán payOS
//   payosWebhook           (HTTP)      — payOS gọi vào đây khi có người chuyển khoản
//                          thành công (sản phẩm hoặc học phí), ta xác nhận + ghi nhận
//   generateMonthlyTuition (scheduled) — ngày 27 hàng tháng, tự "mở sổ" học phí tháng
//                          mới cho học sinh 3 lớp Thầy Thọ vs 2k9/2k10/2k11
//   createTuitionPayment   (callable)  — phụ huynh bấm "Đóng học phí": tạo/tái dùng
//                          link thanh toán payOS cho 1 khoản học phí
//
// Trước khi deploy cần khai báo 3 secret lấy từ trang quản trị payOS:
//   firebase functions:secrets:set PAYOS_CLIENT_ID
//   firebase functions:secrets:set PAYOS_API_KEY
//   firebase functions:secrets:set PAYOS_CHECKSUM_KEY
// Sau đó deploy: firebase deploy --only functions
// =========================================================

const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const PayOS = require("@payos/node");

admin.initializeApp();
const db = admin.firestore();

const REGION = "asia-southeast1";

// Phải khớp với ADMIN_UID trong firebase-config.js — giáo viên xem/tải mọi nội dung miễn phí, không qua payOS
const ADMIN_UID = "cbWUWVPZ8Fgni1gQjbz7ycJvfL72";

// 3 lớp học phí tự động — phải khớp id trong CLASS_LIST (firebase-config.js)
const TUITION_CLASS_IDS = ["tho-2k9", "tho-2k10", "tho-2k11"];
const DEFAULT_TUITION_AMOUNT = 800000;

const payosClientId = defineSecret("PAYOS_CLIENT_ID");
const payosApiKey = defineSecret("PAYOS_API_KEY");
const payosChecksumKey = defineSecret("PAYOS_CHECKSUM_KEY");

function getPayOS() {
  return new PayOS(payosClientId.value(), payosApiKey.value(), payosChecksumKey.value());
}

// Khóa học online có sẵn 1 nhóm Zalo riêng (field zaloGroupLink ở products/{id}/private/content).
// Gắn thêm field này vào purchase record để tự động hiện link nhóm Zalo sau khi mua/claim thành công.
async function withZaloGroupLink(productId, category, purchaseData) {
  if (category !== "khoahoc") return purchaseData;
  const privateSnap = await db.collection("products").doc(productId).collection("private").doc("content").get();
  if (privateSnap.exists && privateSnap.data().zaloGroupLink) {
    purchaseData.zaloGroupLink = privateSnap.data().zaloGroupLink;
  }
  return purchaseData;
}

// Tháng hiện tại theo giờ Việt Nam, dạng "yyyy-MM" — dùng làm id document tuition.
function currentMonthVN(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date || new Date());
  const year = parts.find((p) => p.type === "year").value;
  const month = parts.find((p) => p.type === "month").value;
  return `${year}-${month}`;
}

// ---------------------------------------------------------
// generateMonthlyTuition — chạy tự động ngày 27 hàng tháng (giờ VN):
// "mở sổ" học phí tháng hiện tại cho học sinh 3 lớp học phí, nếu chưa có.
// ---------------------------------------------------------
exports.generateMonthlyTuition = onSchedule(
  { region: REGION, schedule: "0 0 27 * *", timeZone: "Asia/Ho_Chi_Minh" },
  async () => {
    const month = currentMonthVN();
    const rosterSnap = await db.collection("roster").where("classId", "in", TUITION_CLASS_IDS).get();

    if (rosterSnap.empty) {
      logger.info("generateMonthlyTuition: không có học sinh nào trong 3 lớp học phí");
      return;
    }

    let created = 0;
    for (const rosterDoc of rosterSnap.docs) {
      const studentId = rosterDoc.id;
      const classId = rosterDoc.data().classId;
      const tuitionRef = db.collection("tuition").doc(`${studentId}_${month}`);

      const existing = await tuitionRef.get();
      if (existing.exists) continue; // đã tạo rồi (vd function chạy lại) — không tạo trùng

      const studentRef = db.collection("students").doc(studentId);
      const studentSnap = await studentRef.get();
      const studentData = studentSnap.exists ? studentSnap.data() : {};
      const override = studentData.nextMonthTuitionOverride;
      const fixedAmount = studentData.fixedTuitionAmount;
      const amount =
        typeof override === "number" && override > 0
          ? override
          : typeof fixedAmount === "number" && fixedAmount > 0
          ? fixedAmount
          : DEFAULT_TUITION_AMOUNT;

      await tuitionRef.set({
        classId,
        studentId,
        month,
        amount,
        status: "chưa đóng",
        note: null,
        currentOrderCode: null,
        currentQrCode: null,
        currentCheckoutUrl: null,
        qrExpiredAt: null,
        paidAt: null,
        paidMethod: null,
        paidOrderCode: null,
        paidNote: null,
        possibleDuplicate: false,
        duplicatePayments: [],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      created++;

      // Học phí riêng chỉ áp dụng cho đúng 1 lần sinh học phí tiếp theo — dùng xong xoá luôn
      if (override !== null && override !== undefined) {
        await studentRef.update({ nextMonthTuitionOverride: admin.firestore.FieldValue.delete() });
      }
    }

    logger.info(`generateMonthlyTuition: đã tạo ${created} khoản học phí tháng ${month} (tổng ${rosterSnap.size} học sinh)`);
  }
);

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

    // Tài khoản giáo viên: luôn được cấp quyền ngay, không phải thanh toán
    if (uid === ADMIN_UID) {
      await purchaseRef.set(
        await withZaloGroupLink(productId, product.category, {
          title: product.title || "",
          category: product.category || "",
          amountVnd: 0,
          method: "admin",
          purchasedAt: admin.firestore.FieldValue.serverTimestamp(),
        })
      );
      return { granted: true, alreadyOwned: false };
    }

    const amountVnd = Number(product.amountVnd) || 0;

    if (amountVnd <= 0) {
      await purchaseRef.set(
        await withZaloGroupLink(productId, product.category, {
          title: product.title || "",
          category: product.category || "",
          amountVnd: 0,
          method: "free",
          purchasedAt: admin.firestore.FieldValue.serverTimestamp(),
        })
      );
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
// createTuitionPayment — gọi từ tuition.js khi phụ huynh/học sinh bấm "Đóng học phí"
// ---------------------------------------------------------
async function runCreateTuitionPayment(uid, tuitionDocId, returnUrl, cancelUrl) {
  const tuitionRef = db.collection("tuition").doc(tuitionDocId);
  const tuitionSnap = await tuitionRef.get();
  if (!tuitionSnap.exists) {
    throw new HttpsError("not-found", "Không tìm thấy khoản học phí này.");
  }
  const tuition = tuitionSnap.data();
  if (tuition.studentId !== uid) {
    throw new HttpsError("permission-denied", "Không có quyền thao tác trên khoản học phí này.");
  }

  if (tuition.status === "đã đóng") {
    return { granted: true };
  }

  // QR cũ còn hiệu lực — trả lại đúng QR đó, không tạo đơn payOS mới
  const now = Date.now();
  if (tuition.currentOrderCode && tuition.qrExpiredAt && tuition.qrExpiredAt.toMillis() > now) {
    return {
      granted: false,
      orderCode: tuition.currentOrderCode,
      checkoutUrl: tuition.currentCheckoutUrl,
      qrCode: tuition.currentQrCode,
    };
  }

  const payos = getPayOS();
  const orderCode = Date.now();
  const finalReturnUrl = returnUrl || "https://thomathclass.github.io/";
  const finalCancelUrl = cancelUrl || finalReturnUrl;

  let paymentLink;
  try {
    paymentLink = await payos.createPaymentLink({
      orderCode,
      amount: Number(tuition.amount) || DEFAULT_TUITION_AMOUNT,
      description: ("HP " + tuition.month).slice(0, 25),
      returnUrl: finalReturnUrl,
      cancelUrl: finalCancelUrl,
    });
  } catch (err) {
    logger.error("payOS createPaymentLink (học phí) lỗi:", err);
    throw new HttpsError("internal", "Không tạo được link thanh toán, thử lại sau.");
  }

  await tuitionRef.update({
    currentOrderCode: String(orderCode),
    currentQrCode: paymentLink.qrCode,
    currentCheckoutUrl: paymentLink.checkoutUrl,
    qrExpiredAt: admin.firestore.Timestamp.fromMillis(now + 30 * 60 * 1000),
  });

  return {
    granted: false,
    orderCode: String(orderCode),
    checkoutUrl: paymentLink.checkoutUrl,
    qrCode: paymentLink.qrCode,
  };
}

exports.createTuitionPayment = onCall(
  { region: REGION, secrets: [payosClientId, payosApiKey, payosChecksumKey], invoker: "public" },
  async (request) => {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError("unauthenticated", "Cần đăng nhập trước khi thao tác.");
    }
    const tuitionDocId = request.data && request.data.tuitionDocId;
    if (!tuitionDocId || typeof tuitionDocId !== "string") {
      throw new HttpsError("invalid-argument", "Thiếu tuitionDocId.");
    }
    return runCreateTuitionPayment(
      auth.uid,
      tuitionDocId,
      request.data && request.data.returnUrl,
      request.data && request.data.cancelUrl
    );
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
      if (orderSnap.exists) {
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
          .set(
            await withZaloGroupLink(order.productId, order.productCategory, {
              title: order.productTitle || "",
              category: order.productCategory || "",
              amountVnd: order.amountVnd,
              method: "payos",
              orderCode,
              purchasedAt: admin.firestore.FieldValue.serverTimestamp(),
            })
          );

        res.status(200).send("ok");
        return;
      }

      // Không khớp đơn mua sản phẩm nào — kiểm tra có phải thanh toán học phí không
      const tuitionQuery = await db
        .collection("tuition")
        .where("currentOrderCode", "==", orderCode)
        .limit(1)
        .get();

      if (tuitionQuery.empty) {
        logger.warn("payosWebhook: không tìm thấy order/tuition tương ứng", orderCode);
        res.status(200).send("ok");
        return;
      }

      const tuitionDoc = tuitionQuery.docs[0];
      const tuition = tuitionDoc.data();

      if (tuition.status === "đã đóng") {
        if (tuition.paidOrderCode === orderCode) {
          // payOS gọi lại webhook của đúng giao dịch đã ghi nhận trước đó — bỏ qua, không phải trùng
          res.status(200).send("ok");
          return;
        }
        // Có giao dịch KHÁC đến sau khi khoản này đã đóng rồi — không ghi đè, chỉ đánh dấu để Thầy xử lý hoàn tiền
        await tuitionDoc.ref.update({
          possibleDuplicate: true,
          duplicatePayments: admin.firestore.FieldValue.arrayUnion({
            orderCode,
            amountVnd: webhookData.amount,
            receivedAt: admin.firestore.Timestamp.now(),
          }),
        });
        logger.warn("payosWebhook: phát hiện thanh toán học phí có thể trùng", tuitionDoc.id, orderCode);
        res.status(200).send("ok");
        return;
      }

      await tuitionDoc.ref.update({
        status: "đã đóng",
        paidAt: admin.firestore.FieldValue.serverTimestamp(),
        paidMethod: "payos",
        paidOrderCode: orderCode,
      });

      res.status(200).send("ok");
    } catch (err) {
      logger.error("payosWebhook lỗi:", err);
      // vẫn trả 200 để payOS không lặp lại gửi vô hạn khi lỗi nằm ở phía mình
      res.status(200).send("ok");
    }
  }
);
