# 🎲 Cờ Tỷ Phú — Vòng Quanh Thế Giới

Board game kinh doanh 32 ô chạy **hoàn toàn trên trình duyệt**: mua đất, xây nhà, dựng Biểu Tượng, thâu tóm thành phố của đối thủ và giành độc quyền để trở thành tỷ phú duy nhất.

- **Không backend, không database** — chỉ 3 file tĩnh, chạy thẳng trên GitHub Pages.
- **Tự động lưu ván chơi** vào `localStorage`, mở lại trang là chơi tiếp.
- **1 người + 3 máy (AI)**, hoặc **Pass & Play** nhiều người chơi chung một máy, hoặc ngồi xem 4 máy đấu nhau.
- Xúc xắc 3D, token di chuyển từng ô, âm thanh tổng hợp bằng **Web Audio API** (không cần file mp3).

## 🚀 Chạy & triển khai

**Chạy trên máy:** mở `index.html` bằng trình duyệt, hoặc chạy một web server tĩnh bất kỳ:

```bash
python3 -m http.server 8000
```

rồi mở `http://localhost:8000`.

**Triển khai lên GitHub Pages:**

1. Push 3 file `index.html`, `style.css`, `game.js` lên nhánh `main`.
2. Vào **Settings → Pages**, mục *Build and deployment* chọn **Deploy from a branch**, nhánh `main`, thư mục `/ (root)`.
3. Sau khoảng 1 phút, game có tại `https://<tên-tài-khoản>.github.io/<tên-repo>/`.

> TailwindCSS và font chữ được tải qua CDN nên cần Internet. Nếu CDN không tải được, `style.css` vẫn chứa toàn bộ giao diện chính nên game vẫn chơi được.

## 🗺️ Bàn cờ 32 ô

Lưới CSS Grid 9×9, các ô đánh số **theo chiều kim đồng hồ từ góc dưới bên trái (ô 0)**. Vùng trung tâm (`grid-row: 2 / 9; grid-column: 2 / 9`) chứa xúc xắc, nút hành động, nhật ký ván đấu và thẻ thông tin 4 người chơi ở 4 góc.

| Ô | Loại | Ô | Loại |
|---|------|---|------|
| 0 | 🏁 **Bắt Đầu** | 16 | 🎉 **Lễ Hội Thế Giới** |
| 1, 2, 3 | Hội An · Huế · Đà Lạt | 17, 18, 19 | Cairo · Istanbul · Dubai |
| 4 | 🏖️ Phú Quốc | 20 | 🏖️ Maldives |
| 5, 7 | Hà Nội · Sài Gòn | 21, 23 | Rome · Barcelona |
| 6 | 🎁 Cơ Hội | 22 | 🎁 Cơ Hội |
| 8 | 🏝️ **Đảo Hoang** | 24 | ✈️ **Chuyến Bay Thế Giới** |
| 9, 10, 11 | Bangkok · Kuala Lumpur · Singapore | 25, 26, 27 | Amsterdam · Paris · London |
| 12 | 🏖️ Bali | 28 | 🏖️ Hawaii |
| 13, 15 | Seoul · Tokyo | 29, 31 | Los Angeles · New York |
| 14 | 🎁 Cơ Hội | 30 | 💸 Thuế |

20 thành phố chia thành 8 nhóm màu (4 nhóm 3 thành phố, 4 nhóm 2 thành phố), giá tăng dần từ $60K (Hội An) đến $400K (New York).

## 📜 Luật chơi

### Lượt chơi
- Lắc 2 xúc xắc rồi đi theo chiều kim đồng hồ. Đổ **đôi** được lắc thêm lượt; đổ đôi **3 lần liên tiếp** bị đưa thẳng ra Đảo Hoang.

### Thành phố — 5 cấp
| Cấp | Công trình | Chi phí | Tiền thuê |
|-----|-----------|---------|-----------|
| 0 | Đất trống (chưa có chủ) | — | — |
| 1 | 🏠 Nhà cấp 1 (gồm đất) | 100% giá gốc | 35% |
| 2 | 🏘️ Nhà cấp 2 | +50% | 90% |
| 3 | 🏢 Nhà cấp 3 | +50% | 175% |
| 4 | 🗼 **Biểu Tượng** | +100% | 320% |

- Khi mua lần đầu hoặc dừng lại thành phố của mình: xây tối đa đến **Nhà cấp 3**.
- **Biểu Tượng** chỉ xây được khi đã có Nhà cấp 3 và **dừng lại ô đó thêm lần nữa**.

### 💥 Mua lại (Hostile Takeover)
- Dừng ở thành phố đối thủ (cấp 1–3): trả tiền thuê xong được quyền trả **gấp đôi giá trị hiện tại** để mua đứt thành phố, sau đó có thể nâng cấp tiếp (tối đa Nhà cấp 3).
- Thành phố đã là **Biểu Tượng** thì không thể bị mua lại. Khu nghỉ dưỡng cũng không thể bị mua lại.

### ⭐ Ô đặc biệt
- 🏁 **Bắt Đầu**: đi qua nhận **$300K**; dừng đúng ô được chọn nâng cấp 1 thành phố đang sở hữu.
- 🏝️ **Đảo Hoang**: kẹt **3 lượt**. Thoát bằng cách đổ đôi, trả **$200K** hoặc dùng thẻ Thuyền Cứu Hộ.
- 🎉 **Lễ Hội Thế Giới**: chọn 1 thành phố của mình để tổ chức — tiền thuê **x2**, các lần tổ chức sau tăng lên **x3, x4**. Mỗi lúc chỉ có 1 thành phố tổ chức Lễ Hội.
- ✈️ **Chuyến Bay Thế Giới**: lượt kế tiếp trả **$50K** để bay tới bất kỳ ô nào (bay vòng qua Bắt Đầu vẫn nhận lương).
- 🏖️ **Khu Nghỉ Dưỡng** (ô 4, 12, 20, 28): giá $200K, không xây nhà; thuê **$50K / $100K / $200K / $400K** khi chủ sở hữu 1 / 2 / 3 / 4 khu.
- 🎁 **Cơ Hội** (ô 6, 14, 22): rút thẻ ngẫu nhiên — nhận thưởng, nộp phạt, ép bán nhà, trôi dạt ra Đảo Hoang, miễn phí nâng cấp, thẻ miễn thuê, thu hồi đất của đối thủ…
- 💸 **Thuế** (ô 30): nộp **10%** tiền mặt.

### 📈 Lạm phát
Từ **vòng 41**, mọi tiền thuê tăng thêm **5% mỗi vòng** (hiển thị trên ô và ở giữa bàn cờ). Cuối ván, khi hầu hết thành phố đã thành Biểu Tượng và không ai còn mua lại được, lương $300K mỗi vòng sẽ khiến ván kéo dài mãi — lạm phát bảo đảm ván đấu luôn có hồi kết.

### 🆘 Phá sản
Không đủ tiền trả nợ → hộp thoại bắt buộc bán bớt thành phố / khu nghỉ dưỡng cho ngân hàng (nhận lại **50%** giá trị) cho tới khi đủ. Bán hết vẫn không đủ → **phá sản**, toàn bộ tiền còn lại thuộc về chủ nợ.

### 🏆 4 cách chiến thắng
1. **Người trụ lại cuối cùng** — mọi đối thủ đều phá sản.
2. **Độc quyền 3 màu** — sở hữu trọn vẹn 3 nhóm màu thành phố bất kỳ.
3. **Độc quyền 1 cạnh** — sở hữu toàn bộ thành phố và khu nghỉ dưỡng trên cùng 1 cạnh bàn cờ.
4. **Độc quyền du lịch** — sở hữu cả 4 Khu Nghỉ Dưỡng.

Tùy chọn **giới hạn vòng** (20/30/50): hết vòng, người có tổng tài sản lớn nhất thắng.

Mô phỏng 50 ván 4 máy đấu nhau: ván kết thúc sau trung vị ~43 vòng (dài nhất 66 vòng); độc quyền 3 màu ~50%, người trụ lại cuối cùng ~22%, độc quyền du lịch ~18%, độc quyền 1 cạnh ~10%.

## 🎮 Điều khiển
- **Space / Enter**: lắc xúc xắc hoặc chọn nút chính của hộp thoại.
- **Rê chuột / chạm vào ô**: xem chi tiết (chủ sở hữu, bảng giá & tiền thuê từng cấp, giá mua lại).
- **Nhấn vào thẻ người chơi**: xem danh sách tài sản của người đó.
- Thanh công cụ: bật/tắt âm thanh · đổi tốc độ (Chậm / Thường / Nhanh / Siêu tốc — tắt hoạt ảnh và âm thanh) · nhật ký · luật chơi · menu.

## 🤖 AI của máy
Máy tự quyết định mua đất (giữ tiền dự phòng theo mức thuê nguy hiểm nhất trên bàn), nâng cấp, xây Biểu Tượng, mua lại thành phố để hoàn thành nhóm màu hoặc phá thế độc quyền của đối thủ, chọn điểm bay, chọn thành phố tổ chức Lễ Hội, cân nhắc ở lại Đảo Hoang khi bàn cờ quá nguy hiểm, và bán tài sản ít giá trị nhất khi thiếu tiền.

## 🧩 Cấu trúc mã nguồn

```
index.html   Khung trang: bàn cờ 9x9, vùng trung tâm, thanh công cụ, màn hình thiết lập
style.css    Toàn bộ giao diện (bàn cờ, xúc xắc 3D, token, hộp thoại, responsive, hiệu ứng)
game.js      Dữ liệu bàn cờ, engine lượt chơi, AI, âm thanh Web Audio, lưu/khôi phục, UI
```

- Trạng thái ván là một JavaScript object, lưu vào `localStorage` (khóa `cotyphu.save.v1`) ở đầu mỗi lần lắc. Cài đặt (âm thanh, tốc độ, người chơi) lưu ở `cotyphu.settings.v1`.
- Bộ sinh số ngẫu nhiên có seed nằm trong trạng thái ván, nên tải lại trang giữa lượt sẽ cho cùng kết quả xúc xắc (không "lắc lại" được).
- Màn hình nhỏ (điện thoại): thẻ người chơi và nhật ký tự chuyển ra dưới/bên cạnh bàn cờ để bàn cờ đủ lớn.
