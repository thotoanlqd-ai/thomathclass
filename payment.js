// ==== ThoMathClass — payment.js ====
// Luồng mua hàng: bấm nút mua -> requireLogin() -> gọi Cloud Function claimProduct ->
// miễn phí thì cấp ngay, có giá thì hiện QR payOS và tự cập nhật khi thanh toán xong.
// Yêu cầu: firebase-config.js (khai báo fns = functions instance), auth-modal.js,
// members.js đã chạy trước. Cần có sẵn trong HTML trang: <div id="payment-modal">...</div>

const paymentModal = document.getElementById("payment-modal");
const ZALO_PHONE = "0388701385";

let currentOrderUnsub = null;

function formatVnd(n) {
  return Number(n || 0).toLocaleString("vi-VN") + "đ";
}

function setPaymentState(state) {
  ["loading", "qr", "granted", "error", "contact"].forEach((s) => {
    const el = document.getElementById("payment-state-" + s);
    if (el) el.hidden = s !== state;
  });
}

function openPaymentModal() {
  if (!paymentModal) return;
  paymentModal.classList.add("open");
  document.body.style.overflow = "hidden";
}

function closePaymentModal() {
  if (!paymentModal) return;
  paymentModal.classList.remove("open");
  document.body.style.overflow = "";
  if (currentOrderUnsub) {
    currentOrderUnsub();
    currentOrderUnsub = null;
  }
}

// Gọi từ products-render.js khi bấm nút mua/đăng ký của 1 sản phẩm.
// product: { id, title, category, amountVnd }  (amountVnd: number, hoặc null/undefined nếu "Liên hệ")
function handleBuyClick(product) {
  requireLogin(() => startPurchaseFlow(product));
}

function startPurchaseFlow(product) {
  openPaymentModal();
  document.getElementById("payment-product-name").textContent = product.title;

  if (product.amountVnd === null || product.amountVnd === undefined) {
    setPaymentState("contact");
    return;
  }

  setPaymentState("loading");

  fns
    .httpsCallable("claimProduct")({
      productId: product.id,
      returnUrl: window.location.href,
      cancelUrl: window.location.href,
    })
    .then((result) => {
      const data = result.data || {};
      if (data.granted) {
        showGrantedContent(product);
      } else {
        showQrPayment(data, product);
      }
    })
    .catch((err) => {
      console.error(err);
      setPaymentState("error");
      document.getElementById("payment-error-text").textContent =
        "Không tạo được đơn thanh toán (" +
        (err.message || "lỗi không xác định") +
        "). Thầy/em thử lại sau, hoặc nhắn Zalo cho Thầy.";
    });
}

function showQrPayment(data, product) {
  setPaymentState("qr");
  document.getElementById("payment-amount").textContent = formatVnd(product.amountVnd);
  document.getElementById("payment-status-text").textContent = "Đang chờ thanh toán, đừng tắt trang này...";

  const checkoutLink = document.getElementById("payment-checkout-link");
  if (checkoutLink) checkoutLink.href = data.checkoutUrl || "#";

  const canvas = document.getElementById("payment-qr-canvas");
  if (canvas && window.QRCode && data.qrCode) {
    QRCode.toCanvas(canvas, data.qrCode, { width: 220, margin: 1 }, (err) => {
      if (err) console.error("Vẽ QR lỗi:", err);
    });
  }

  if (currentOrderUnsub) currentOrderUnsub();
  currentOrderUnsub = db
    .collection("orders")
    .doc(data.orderCode)
    .onSnapshot((snap) => {
      if (!snap.exists) return;
      const order = snap.data();
      if (order.status === "paid") {
        if (currentOrderUnsub) {
          currentOrderUnsub();
          currentOrderUnsub = null;
        }
        showGrantedContent(product);
      }
    });
}

function showGrantedContent(product) {
  setPaymentState("granted");
  db.collection("products")
    .doc(product.id)
    .collection("private")
    .doc("content")
    .get()
    .then((snap) => {
      const linkBtn = document.getElementById("payment-content-link");
      if (snap.exists && snap.data().linkUrl) {
        linkBtn.href = snap.data().linkUrl;
        linkBtn.textContent = snap.data().linkLabel || "Xem/Tải nội dung";
        linkBtn.hidden = false;
      } else {
        linkBtn.hidden = true;
      }
    })
    .catch((err) => console.error(err));

  if (typeof markProductOwned === "function") markProductOwned(product.id);
}

if (paymentModal) {
  document.getElementById("payment-modal-close").addEventListener("click", closePaymentModal);
  paymentModal.addEventListener("click", (e) => {
    if (e.target === paymentModal) closePaymentModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closePaymentModal();
  });
}
