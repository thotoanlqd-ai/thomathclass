// ==== ThoMathClass — image-compress.js ====
// Resize + nén ảnh phía trình duyệt trước khi tải lên Firebase Storage,
// tránh ảnh gốc chụp từ điện thoại quá nặng. Dùng chung cho Nhật ký lớp học
// và Ảnh đại diện học sinh.

function compressImageFile(file, maxWidth, quality) {
  maxWidth = maxWidth || 1200;
  quality = quality || 0.75;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Không đọc được file ảnh."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("File không phải ảnh hợp lệ."));
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error("Nén ảnh thất bại."))),
          "image/jpeg",
          quality
        );
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
