// ==== ThoMathClass — tuition.js ====
// Học phí tự động cho 3 lớp "Thầy Thọ vs 2k9/2k10/2k11". Dùng ở lophoc.html.
// Tái dùng đúng cơ chế QR payOS + Firestore realtime đang có trong payment.js,
// nhưng nhắm vào collection tuition thay vì products/orders/purchases.
// Yêu cầu: firebase-config.js, script.js (escapeHtml không cần, tự định nghĩa riêng),
// members.js, lophoc.js đã chạy trước (khai báo auth, db, fns).

const TUITION_CLASS_IDS = ["tho-2k9", "tho-2k10", "tho-2k11"];

const tuitionModal = document.getElementById("tuition-modal");
const tuitionSection = document.getElementById("tuition-section");
const tuitionList = document.getElementById("tuition-list");

let tuitionListUnsub = null;
let currentTuitionUnsub = null;

function escapeHtmlTuition(str) {
  const div = document.createElement("div");
  div.textContent = str === undefined || str === null ? "" : String(str);
  return div.innerHTML;
}

function formatVndTuition(n) {
  return Number(n || 0).toLocaleString("vi-VN") + "đ";
}

// "2026-07" -> "7/2026"
function tuitionMonthLabel(month) {
  const parts = (month || "").split("-");
  if (parts.length !== 2) return month || "";
  return Number(parts[1]) + "/" + parts[0];
}

// ---------- Danh sách khoản học phí chưa đóng (realtime) ----------
function watchTuitionList(uid) {
  stopTuitionListWatch();
  tuitionListUnsub = db
    .collection("tuition")
    .where("studentId", "==", uid)
    .onSnapshot(
      (snap) => {
        const items = [];
        snap.forEach((doc) => {
          const d = doc.data();
          if (d.status !== "đã đóng") items.push(Object.assign({ id: doc.id }, d));
        });
        renderTuitionList(items);
      },
      (err) => console.error("watchTuitionList lỗi:", err)
    );
}

function stopTuitionListWatch() {
  if (tuitionListUnsub) {
    tuitionListUnsub();
    tuitionListUnsub = null;
  }
  if (tuitionSection) tuitionSection.hidden = true;
}

function renderTuitionList(items) {
  if (!tuitionSection || !tuitionList) return;
  if (!items.length) {
    tuitionSection.hidden = true;
    tuitionList.innerHTML = "";
    return;
  }
  items.sort((a, b) => (a.month < b.month ? -1 : 1));
  tuitionSection.hidden = false;
  tuitionList.innerHTML = "";
  items.forEach((item) => {
    const label = "Học phí tháng " + tuitionMonthLabel(item.month);
    const noteHtml = item.note
      ? `<br><span style="font-size:0.82rem;color:var(--muted);">${escapeHtmlTuition(item.note)}</span>`
      : "";
    const row = document.createElement("div");
    row.className = "tuition-row";
    row.style.cssText =
      "display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border:1px solid var(--card-border);border-radius:10px;margin-bottom:10px;flex-wrap:wrap;";
    row.innerHTML = `
      <span style="font-size:0.92rem;">${escapeHtmlTuition(label)} — ${escapeHtmlTuition(formatVndTuition(item.amount))}${noteHtml}</span>
      <button class="btn btn-primary btn-small" data-action="pay">Đóng học phí tháng ${escapeHtmlTuition(tuitionMonthLabel(item.month))}</button>
    `;
    row.querySelector('[data-action="pay"]').addEventListener("click", () => openTuitionPayment(item));
    tuitionList.appendChild(row);
  });
}

// ---------- Modal thanh toán ----------
function setTuitionState(state) {
  ["loading", "qr", "paid", "error"].forEach((s) => {
    const el = document.getElementById("tuition-state-" + s);
    if (el) el.hidden = s !== state;
  });
}

function openTuitionModal() {
  if (!tuitionModal) return;
  tuitionModal.classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeTuitionModal() {
  if (!tuitionModal) return;
  tuitionModal.classList.remove("open");
  document.body.style.overflow = "";
  if (currentTuitionUnsub) {
    currentTuitionUnsub();
    currentTuitionUnsub = null;
  }
}

function openTuitionPayment(item) {
  document.getElementById("tuition-product-name").textContent = "Học phí tháng " + tuitionMonthLabel(item.month);
  document.getElementById("tuition-amount").textContent = formatVndTuition(item.amount);
  document.getElementById("tuition-note").textContent = item.note || "";
  openTuitionModal();
  setTuitionState("loading");

  fns
    .httpsCallable("createTuitionPayment")({
      tuitionDocId: item.id,
      returnUrl: window.location.href,
      cancelUrl: window.location.href,
    })
    .then((result) => {
      const data = result.data || {};
      if (data.granted) {
        setTuitionState("paid");
      } else {
        showTuitionQr(data);
        watchTuitionDoc(item.id);
      }
    })
    .catch((err) => {
      console.error(err);
      setTuitionState("error");
      document.getElementById("tuition-error-text").textContent =
        "Không tạo được đơn thanh toán (" + (err.message || "lỗi không xác định") + "). Thử lại sau, hoặc nhắn Zalo cho Thầy.";
    });
}

function showTuitionQr(data) {
  setTuitionState("qr");
  document.getElementById("tuition-status-text").textContent = "Đang chờ thanh toán, đừng tắt trang này...";

  const checkoutLink = document.getElementById("tuition-checkout-link");
  if (checkoutLink) checkoutLink.href = data.checkoutUrl || "#";

  const qrContainer = document.getElementById("tuition-qr-canvas");
  if (qrContainer && window.QRCode && data.qrCode) {
    qrContainer.innerHTML = ""; // xoá QR cũ (nếu có) trước khi vẽ QR mới
    try {
      new QRCode(qrContainer, {
        text: data.qrCode,
        width: 220,
        height: 220,
        correctLevel: QRCode.CorrectLevel.M,
      });
    } catch (err) {
      console.error("Vẽ QR học phí lỗi:", err);
    }
  }
}

function watchTuitionDoc(tuitionDocId) {
  if (currentTuitionUnsub) currentTuitionUnsub();
  currentTuitionUnsub = db
    .collection("tuition")
    .doc(tuitionDocId)
    .onSnapshot((snap) => {
      if (!snap.exists) return;
      if (snap.data().status === "đã đóng") {
        if (currentTuitionUnsub) {
          currentTuitionUnsub();
          currentTuitionUnsub = null;
        }
        setTuitionState("paid");
      }
    });
}

if (tuitionModal) {
  document.getElementById("tuition-modal-close").addEventListener("click", closeTuitionModal);
  tuitionModal.addEventListener("click", (e) => {
    if (e.target === tuitionModal) closeTuitionModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeTuitionModal();
  });
}

// ---------- Khởi động: chỉ theo dõi học phí nếu học sinh thuộc 1 trong 3 lớp học phí ----------
auth.onAuthStateChanged((user) => {
  if (!user) {
    stopTuitionListWatch();
    return;
  }
  db.collection("students")
    .doc(user.uid)
    .get()
    .then((doc) => {
      const classId = doc.exists ? doc.data().classId : null;
      if (TUITION_CLASS_IDS.indexOf(classId) !== -1) {
        watchTuitionList(user.uid);
      } else {
        stopTuitionListWatch();
      }
    })
    .catch((err) => console.error(err));
});
