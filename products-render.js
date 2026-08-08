// ==== ThoMathClass — products-render.js ====
// Dùng chung cho baigiang.html, tailieu.html, khoahoc.html, azota.html
// Mỗi trang cần khai báo trước khi include file này:
//   const PRODUCT_CATEGORY = "baigiang" | "tailieu" | "khoahoc" | "azota";
//   const BUY_LABEL = "Mua ngay" | "Đăng ký";
// Yêu cầu: firebase-config.js, members.js, auth-modal.js, payment.js đã chạy trước.
//
// Nội dung thật (linkUrl) KHÔNG còn nằm trong doc products/{id} — nó nằm ở
// products/{id}/private/content và chỉ đọc được nếu đã mua (xem firestore-rules.txt).
// Vì vậy card sản phẩm chỉ hiện link SAU KHI xác nhận đã mua/đã dùng miễn phí.

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
let purchasesMap = {}; // { [productId]: purchaseData } — sản phẩm user hiện tại đã mua/đã dùng miễn phí
let currentFilterSlug = "all";

function loadProducts() {
  const grid = document.getElementById("product-grid");
  const emptyNote = document.getElementById("products-empty");

  const productsPromise = db
    .collection("products")
    .where("category", "==", PRODUCT_CATEGORY)
    .orderBy("order", "desc")
    .get();

  // Đợi Firebase Auth khôi phục phiên đăng nhập (nếu có) trước khi đọc danh sách đã mua,
  // để không hiển thị nhầm "chưa mua" ngay lúc mới tải trang.
  const authReadyPromise = new Promise((resolve) => {
    const unsub = auth.onAuthStateChanged((user) => {
      unsub();
      resolve(user);
    });
  });

  Promise.all([productsPromise, authReadyPromise])
    .then(([snap]) => {
      allProducts = [];
      snap.forEach((doc) => allProducts.push(Object.assign({ id: doc.id }, doc.data())));
      return getMyPurchasesMap();
    })
    .then((purchases) => {
      purchasesMap = purchases;
      buildFilterBar();
      renderProductGrid(getFilteredProducts());
    })
    .catch((err) => {
      console.error(err);
      grid.innerHTML = "";
      emptyNote.hidden = false;
      emptyNote.textContent = "Không tải được nội dung, thầy/em thử tải lại trang.";
    });
}

function getFilteredProducts() {
  if (currentFilterSlug === "all") return allProducts;
  return allProducts.filter((p) => slugifyTag(p.tag || "Chung") === currentFilterSlug);
}

// Gọi từ payment.js ngay sau khi 1 sản phẩm được cấp quyền (mua xong hoặc claim miễn phí),
// để card đổi trạng thái ngay mà không cần tải lại trang. extra: dữ liệu bổ sung merge vào
// (vd { zaloGroupLink } để card khóa học hiện luôn nút vào nhóm Zalo, không cần tải lại trang).
function markProductOwned(productId, extra) {
  purchasesMap[productId] = Object.assign({ purchasedAt: new Date() }, purchasesMap[productId], extra || {});
  renderProductGrid(getFilteredProducts());
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
  currentFilterSlug = filterSlug;
  renderProductGrid(getFilteredProducts());
}

// Mở nội dung của 1 sản phẩm đã sở hữu — đọc link ngay lúc bấm (không lưu link ra HTML
// công khai), theo đúng rule products/{id}/private/content chỉ ai đã mua mới đọc được.
function openOwnedContent(p, btnEl) {
  const originalLabel = btnEl.textContent;
  btnEl.disabled = true;
  btnEl.textContent = "Đang mở...";
  db.collection("products")
    .doc(p.id)
    .collection("private")
    .doc("content")
    .get()
    .then((snap) => {
      btnEl.disabled = false;
      btnEl.textContent = originalLabel;
      if (snap.exists && snap.data().linkUrl) {
        window.open(snap.data().linkUrl, "_blank", "noopener");
      } else {
        alert("Nội dung đang được Thầy cập nhật, thầy/em quay lại sau nhé.");
      }
    })
    .catch((err) => {
      console.error(err);
      btnEl.disabled = false;
      btnEl.textContent = originalLabel;
      alert("Có lỗi khi mở nội dung, thử lại sau.");
    });
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
    const owned = !!purchasesMap[p.id];
    const isCourse = PRODUCT_CATEGORY === "khoahoc";
    const actionHtml = owned
      ? '<button class="btn btn-primary btn-small" data-action="open">Xem/Tải nội dung</button>' +
        (isCourse ? '<a href="#" target="_blank" rel="noopener" class="btn btn-outline btn-small" data-action="zalo-group" hidden>Tham gia nhóm Zalo</a>' : "")
      : '<button class="btn btn-primary btn-small" data-action="buy">' + escapeHtmlP(BUY_LABEL) + "</button>";

    card.innerHTML = `
      <div class="product-thumb"><span class="tag mono">${escapeHtmlP((p.tag || "CHUNG").toUpperCase())}</span>${iconSvg}</div>
      <div class="product-body">
        <h3>${escapeHtmlP(p.title)}</h3>
        <p>${escapeHtmlP(p.description || "")}</p>
        <div class="product-foot">
          <span class="price">${escapeHtmlP(p.price || "")}</span>
          <div class="product-actions" style="display:flex;gap:8px;flex-wrap:wrap;">${actionHtml}</div>
        </div>
      </div>
    `;

    if (owned && isCourse) {
      const zaloGroupLink = purchasesMap[p.id] && purchasesMap[p.id].zaloGroupLink;
      const zaloBtn = card.querySelector('[data-action="zalo-group"]');
      if (zaloBtn && zaloGroupLink) {
        zaloBtn.href = zaloGroupLink;
        zaloBtn.hidden = false;
      }
    }

    const actionBtn = card.querySelector('[data-action="open"], [data-action="buy"]');
    if (owned) {
      actionBtn.addEventListener("click", () => openOwnedContent(p, actionBtn));
    } else {
      actionBtn.addEventListener("click", () => {
        handleBuyClick({
          id: p.id,
          title: p.title,
          category: p.category,
          amountVnd: p.amountVnd === undefined ? null : p.amountVnd,
        });
      });
    }

    grid.appendChild(card);
  });
}

loadProducts();
