// ==== ThoMathClass — products-render.js ====
// Dùng chung cho baigiang.html, tailieu.html, khoahoc.html, azota.html
// Mỗi trang cần khai báo trước khi include file này:
//   const PRODUCT_CATEGORY = "baigiang" | "tailieu" | "khoahoc" | "azota";
//   const BUY_LABEL = "Mua ngay" | "Đăng ký";
// Yêu cầu: firebase-config.js đã chạy trước (khai báo db), script.js đã chạy trước (openOrderModal)

const CATEGORY_ICONS = {
  baigiang:
    '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.4"><path d="M3 12h4l3-8 4 16 3-8h4"/></svg>',
  tailieu:
    '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.4"><path d="M6 3h9l5 5v13H6z"/><path d="M15 3v5h5"/></svg>',
  khoahoc:
    '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.4"><rect x="3" y="5" width="14" height="10" rx="1.5"/><path d="M17 8.5l4-2.5v9l-4-2.5"/></svg>',
  azota:
    '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.4"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/><path d="M7.5 13.5l2.5 2.5 5-5"/></svg>',
};

function escapeHtmlP(str) {
  const div = document.createElement("div");
  div.textContent = str === undefined || str === null ? "" : String(str);
  return div.innerHTML;
}

function slugifyTag(tag) {
  return (tag || "chung")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "chung";
}

let allProducts = [];

function loadProducts() {
  const grid = document.getElementById("product-grid");
  const emptyNote = document.getElementById("products-empty");
  const filterBar = document.getElementById("filter-bar");

  db.collection("products")
    .where("category", "==", PRODUCT_CATEGORY)
    .orderBy("order")
    .get()
    .then((snap) => {
      allProducts = [];
      snap.forEach((doc) => allProducts.push(Object.assign({ id: doc.id }, doc.data())));
      buildFilterBar();
      renderProductGrid(allProducts);
    })
    .catch((err) => {
      console.error(err);
      grid.innerHTML = "";
      emptyNote.hidden = false;
      emptyNote.textContent = "Không tải được nội dung, thầy/em thử tải lại trang.";
    });
}

function buildFilterBar() {
  const filterBar = document.getElementById("filter-bar");
  if (!filterBar) return;
  filterBar.innerHTML = "";

  const allBtn = document.createElement("button");
  allBtn.className = "filter-btn active";
  allBtn.textContent = "Tất cả";
  allBtn.dataset.filter = "all";
  allBtn.addEventListener("click", () => setActiveFilter(allBtn, "all"));
  filterBar.appendChild(allBtn);

  const seenTags = new Map(); // slug -> label
  allProducts.forEach((p) => {
    const tag = p.tag || "Chung";
    const slug = slugifyTag(tag);
    if (!seenTags.has(slug)) seenTags.set(slug, tag);
  });

  seenTags.forEach((label, slug) => {
    const btn = document.createElement("button");
    btn.className = "filter-btn";
    btn.textContent = label;
    btn.dataset.filter = slug;
    btn.addEventListener("click", () => setActiveFilter(btn, slug));
    filterBar.appendChild(btn);
  });
}

function setActiveFilter(activeBtn, filterSlug) {
  document.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
  activeBtn.classList.add("active");
  if (filterSlug === "all") {
    renderProductGrid(allProducts);
  } else {
    renderProductGrid(allProducts.filter((p) => slugifyTag(p.tag || "Chung") === filterSlug));
  }
}

function renderProductGrid(products) {
  const grid = document.getElementById("product-grid");
  const emptyNote = document.getElementById("products-empty");
  grid.innerHTML = "";

  if (!products.length) {
    emptyNote.hidden = false;
    return;
  }
  emptyNote.hidden = true;

  products.forEach((p) => {
    const card = document.createElement("div");
    card.className = "product-card";

    const iconSvg = CATEGORY_ICONS[PRODUCT_CATEGORY] || CATEGORY_ICONS.tailieu;
    const linkHtml = p.linkUrl
      ? `<div class="product-links"><a href="${escapeHtmlP(p.linkUrl)}" target="_blank" rel="noopener" class="link-azota">${escapeHtmlP(p.linkLabel || "Xem thêm →")}</a></div>`
      : "";

    card.innerHTML = `
      <div class="product-thumb"><span class="tag mono">${escapeHtmlP((p.tag || "CHUNG").toUpperCase())}</span>${iconSvg}</div>
      <div class="product-body">
        <h3>${escapeHtmlP(p.title)}</h3>
        <p>${escapeHtmlP(p.description || "")}</p>
        <div class="product-foot">
          <span class="price">${escapeHtmlP(p.price || "")}</span>
          <button class="btn btn-primary btn-small" data-buy-title="${escapeHtmlP(p.title)}">${BUY_LABEL}</button>
        </div>
      </div>
      ${linkHtml}
    `;

    card.querySelector("[data-buy-title]").addEventListener("click", (e) => {
      openOrderModal(e.target.dataset.buyTitle);
    });

    grid.appendChild(card);
  });
}

loadProducts();
