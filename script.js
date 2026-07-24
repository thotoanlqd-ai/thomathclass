// ==== ThoMathClass — script.js ====

// --- Mobile nav toggle ---
const navToggle = document.querySelector(".nav-toggle");
const navLinks = document.querySelector(".nav-links");
if (navToggle && navLinks) {
  navToggle.addEventListener("click", () => {
    navLinks.classList.toggle("open");
  });
}

// --- Highlight current page in nav ---
if (navLinks) {
  const currentPage = location.pathname.split("/").pop() || "index.html";
  navLinks.querySelectorAll("a").forEach((link) => {
    const href = link.getAttribute("href");
    if (href.includes("#")) return; // in-page anchor, not a distinct page
    if (href === currentPage) link.classList.add("active");
  });
}

// --- Scroll reveal ---
const revealEls = document.querySelectorAll(".reveal");
if ("IntersectionObserver" in window && revealEls.length) {
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );
  revealEls.forEach((el) => io.observe(el));
} else {
  revealEls.forEach((el) => el.classList.add("in"));
}

// --- Product filter (bài giảng / tài liệu pages) ---
const filterBtns = document.querySelectorAll(".filter-btn");
const productCards = document.querySelectorAll(".product-card");
if (filterBtns.length) {
  filterBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      filterBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const cat = btn.dataset.filter;
      productCards.forEach((card) => {
        const match = cat === "all" || card.dataset.category === cat;
        card.style.display = match ? "" : "none";
      });
    });
  });
}

// --- Order modal ---
const modalOverlay = document.getElementById("order-modal");
const modalProductName = document.getElementById("modal-product-name");
const modalCloseBtn = document.querySelector(".modal-close");
const modalZaloLink = document.getElementById("modal-zalo-link");

function openOrderModal(productName) {
  if (!modalOverlay) return;
  modalProductName.textContent = productName;
  const ZALO_PHONE = "0388701385";
  modalZaloLink.href = `https://zalo.me/${ZALO_PHONE}`;
  modalOverlay.classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeOrderModal() {
  if (!modalOverlay) return;
  modalOverlay.classList.remove("open");
  document.body.style.overflow = "";
}

document.querySelectorAll("[data-buy]").forEach((btn) => {
  btn.addEventListener("click", () => openOrderModal(btn.dataset.buy));
});

if (modalCloseBtn) modalCloseBtn.addEventListener("click", closeOrderModal);
if (modalOverlay) {
  modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) closeOrderModal();
  });
}
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeOrderModal();
});

// --- Copy bank account number ---
const copyBtn = document.getElementById("copy-stk");
if (copyBtn) {
  copyBtn.addEventListener("click", () => {
    const stk = copyBtn.dataset.value;
    navigator.clipboard.writeText(stk).then(() => {
      const old = copyBtn.textContent;
      copyBtn.textContent = "Đã sao chép!";
      setTimeout(() => (copyBtn.textContent = old), 1500);
    });
  });
}
