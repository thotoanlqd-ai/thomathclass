// ==== ThoMathClass — sw.js (Service Worker) ====
// Mục tiêu: chỉ đủ để web được công nhận là PWA (cài lên màn hình chính được).
// Chiến lược: LUÔN ưu tiên tải bản mới nhất từ mạng trước.
// Chỉ dùng bản lưu tạm (cache) khi máy không có mạng — để tránh lặp lại
// tình trạng "sửa web rồi mà vẫn thấy bản cũ" đã từng gặp nhiều lần.

const CACHE_NAME = "thomathclass-cache-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Chỉ xử lý các request GET thông thường (bỏ qua Firebase/Firestore, POST...)
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Có mạng: dùng bản mới nhất, đồng thời lưu tạm 1 bản để phòng khi mất mạng
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      })
      .catch(() => {
        // Mất mạng: dùng bản đã lưu tạm trước đó (nếu có)
        return caches.match(event.request);
      })
  );
});
