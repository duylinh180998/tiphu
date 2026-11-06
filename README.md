# 🎲 Cờ Tỷ Phú — Vòng Quanh Thế Giới

Board game kinh doanh 32 ô với **bàn cờ 3D góc nhìn isometric**, chạy **hoàn toàn trên trình duyệt**: mua đất, xây nhà, dựng Biểu Tượng, thâu tóm thành phố của đối thủ và giành độc quyền để trở thành tỷ phú duy nhất.

- **Không backend, không database** — chỉ file tĩnh (HTML + CSS + ES modules), chạy thẳng trên GitHub Pages.
- **Bàn cờ 3D** dựng bằng CSS 3D transforms: ô có độ dày, nhà/tòa nhà/tháp Biểu Tượng 3D mang màu chủ sở hữu, quân cờ đứng, xúc xắc 3D lăn trên mặt bàn. Có thể đổi sang **góc nhìn 2D** phẳng (mặc định trên điện thoại dọc).
- **3 cách chơi:** 1 người đấu máy (AI) · **Pass & Play** nhiều người chung một máy · **Chơi trực tuyến tối đa 4 người** (WebRTC ngang hàng, ghế trống có thể để máy chơi).
- **Tự động lưu ván** vào `localStorage`; tải lại trang là chơi tiếp, kể cả ván trực tuyến (chủ phòng mở lại phòng, mọi người tự kết nối lại).
- Âm thanh tổng hợp bằng **Web Audio API** (không cần file mp3).

## 🚀 Chạy & triển khai

Mã nguồn dùng **ES modules** nên cần mở qua một web server (mở trực tiếp file `index.html` bằng `file://` sẽ bị trình duyệt chặn module):

```bash
python3 -m http.server 8000
```

rồi mở `http://localhost:8000`.

**Triển khai lên GitHub Pages:**

1. Push toàn bộ repo (gồm `index.html`, thư mục `css/` và `js/`) lên nhánh `main`.
2. Vào **Settings → Pages**, mục *Build and deployment* chọn **Deploy from a branch**, nhánh `main`, thư mục `/ (root)`.
3. Sau khoảng 1 phút, game có tại `https://<tên-tài-khoản>.github.io/<tên-repo>/`.

> TailwindCSS, font chữ và thư viện PeerJS (chỉ tải khi chơi trực tuyến) được lấy qua CDN nên cần Internet. Nếu CDN Tailwind không tải được, các file CSS trong `css/` vẫn chứa toàn bộ giao diện nên game vẫn chơi được.

## 🌐 Chơi trực tuyến

1. Một người chọn **Chơi trực tuyến → Tạo phòng** và gửi **mã phòng 6 ký tự** hoặc **đường link mời** (`…/?room=ABC123`) cho bạn bè.
2. Bạn bè mở link (mã được điền sẵn) hoặc nhập mã ở mục **Vào phòng**.
3. Trong phòng chờ, chủ phòng có thể thêm máy vào ghế trống, đóng ghế, mời người ra, chỉnh tiền khởi điểm / giới hạn vòng, rồi bấm **Bắt đầu** (cần ít nhất 2 người chơi, tính cả máy).

Cách hoạt động:

- Các trình duyệt kết nối **trực tiếp** với nhau qua WebRTC (thư viện [PeerJS](https://peerjs.com)); máy chủ tín hiệu miễn phí PeerJS Cloud chỉ dùng để "bắt tay" ban đầu. Không có máy chủ game hay cơ sở dữ liệu nào.
- **Chủ phòng giữ trạng thái gốc và chạy luật chơi**; các máy khác nhận ảnh chụp trạng thái + sự kiện hoạt ảnh để hiển thị, và chỉ gửi lại lựa chọn của mình. Chủ phòng kiểm tra mọi lựa chọn nhận được (không hợp lệ → dùng phương án an toàn), máy khách lọc mọi nội dung HTML nhận về.
- Mỗi quyết định có **45 giây** (bán tài sản: 75 giây); hết giờ hệ thống tự chọn phương án an toàn (không mua, không nâng cấp…).
- Người **mất kết nối** được chờ **20 giây**, sau đó máy tạm chơi thay; mở lại trang và bấm **Vào lại** trên menu để giành lại ghế.
- Nếu **chủ phòng tải lại trang**, ván vẫn được lưu: chọn **Mở lại phòng** để mở lại với mã cũ, người chơi khác tự kết nối lại.
- Gửi **biểu cảm** 👍 😂 😱 😡 🎉 🙏 bằng nút 😀 trên thanh công cụ.
- Một số mạng công ty/trường học chặn kết nối ngang hàng; khi đó hãy thử mạng khác (ví dụ 4G).
- Tùy chọn nâng cao: dùng máy chủ tín hiệu riêng (gói npm [`peer`](https://www.npmjs.com/package/peer)) bằng tham số URL, ví dụ `?peer=may-chu-cua-ban.vn:9000&peerpath=/myapp&peersecure=1`.

## 🗺️ Bàn cờ 32 ô

Lưới CSS Grid 9×9, các ô đánh số **theo chiều kim đồng hồ từ góc dưới bên trái (ô 0)**. Ở góc nhìn 3D, bàn cờ được xoay thành hình thoi (ô Bắt Đầu ở dưới cùng), chữ trên ô chạy dọc theo cạnh và công trình đứng ở nửa xa camera để không che tên ô. Vùng trung tâm (`grid-row: 2 / 9; grid-column: 2 / 9`) chứa xúc xắc, nút hành động và trạng thái; 4 thẻ người chơi nằm ở 4 góc màn hình, nhật ký ở góc trên trái.

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

### 💥 Mua lại
- Dừng ở thành phố đối thủ (cấp 1–3): trả tiền thuê xong được quyền trả **gấp đôi giá trị hiện tại** để mua đứt thành phố, sau đó có thể nâng cấp tiếp (tối đa Nhà cấp 3).
- Thành phố đã là **Biểu Tượng** và khu nghỉ dưỡng không thể bị mua lại.

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
Không đủ tiền trả nợ → hộp thoại bắt buộc chọn bán bớt thành phố / khu nghỉ dưỡng cho ngân hàng (nhận lại **50%** giá trị) cho tới khi đủ (có nút gợi ý tự động). Bán hết vẫn không đủ → **phá sản**, toàn bộ tiền còn lại thuộc về chủ nợ.

### 🏆 4 cách chiến thắng
1. **Người trụ lại cuối cùng** — mọi đối thủ đều phá sản.
2. **Độc quyền 3 màu** — sở hữu trọn vẹn 3 nhóm màu thành phố bất kỳ.
3. **Độc quyền 1 cạnh** — sở hữu toàn bộ thành phố và khu nghỉ dưỡng trên cùng 1 cạnh bàn cờ.
4. **Độc quyền du lịch** — sở hữu cả 4 Khu Nghỉ Dưỡng.

Tùy chọn **giới hạn vòng** (20/30/50): hết vòng, người có tổng tài sản lớn nhất thắng.

## 🎮 Điều khiển
- **Space / Enter**: lắc xúc xắc hoặc chọn nút chính của hộp thoại.
- **Rê chuột / chạm vào ô**: xem chi tiết (chủ sở hữu, bảng giá & tiền thuê từng cấp, giá mua lại).
- **Nhấn vào thẻ người chơi**: xem danh sách tài sản của người đó.
- Thanh công cụ: âm thanh · tốc độ (Chậm / Thường / Nhanh / Siêu tốc) · góc nhìn **3D / 2D** · nhật ký · biểu cảm (trực tuyến) · luật chơi · menu.

## 🤖 AI của máy
Máy tự quyết định mua đất (giữ tiền dự phòng theo mức thuê nguy hiểm nhất trên bàn), nâng cấp, xây Biểu Tượng, mua lại thành phố để hoàn thành nhóm màu hoặc phá thế độc quyền của đối thủ, chọn điểm bay, chọn thành phố tổ chức Lễ Hội, cân nhắc ở lại Đảo Hoang khi bàn cờ quá nguy hiểm, và bán tài sản ít giá trị nhất khi thiếu tiền. Khi chơi trực tuyến, cùng AI này chơi thay người mất kết nối.

## 🧩 Cấu trúc mã nguồn

```
index.html              Khung trang: khung cảnh 3D, HUD, thanh công cụ, các màn hình menu/phòng chờ
css/
  base.css              Biến giao diện, nền, nút, nhãn, keyframes dùng chung
  board3d.css           Phép chiếu isometric, ô có độ dày, mô hình 3D, biển đứng, quân cờ, xúc xắc, chế độ 2D
  hud.css               Thẻ người chơi 4 góc, lớp phủ giữa bàn cờ, nhật ký, thanh công cụ, bố cục màn hẹp
  dialogs.css           Hộp thoại, thẻ chủ quyền, thẻ Cơ Hội, bán tài sản, tooltip
  screens.css           Menu chính, thiết lập ván, chơi trực tuyến, phòng chờ
js/
  main.js               Điểm khởi động: nối giao diện ⇄ engine ⇄ mạng, điều hướng menu, phím tắt
  config.js             Hằng số luật chơi, tốc độ, màu người chơi, cấu hình mạng & góc nhìn
  data/board.js         32 ô, 8 nhóm màu, bộ thẻ Cơ Hội, hàm vị trí lưới
  core/                 util (định dạng tiền, lọc HTML) · session (hủy tác vụ khi đổi ván) · store (trạng thái + localStorage) · rng (ngẫu nhiên có seed) · bus (sự kiện)
  game/                 rules (truy vấn luật) · engine (vòng lặp lượt chơi) · players (điều phối quyết định: máy / người trên máy này / người từ xa) · ai · text
  ui/                   board3d · models (nhà/tòa nhà/tháp CSS 3D) · tokens · dice · hud · dialogs · select · fx · audio · layout · screens · view (lớp trình bày, phát sóng sự kiện khi chơi trực tuyến) · ask · prompt · dom
  net/                  peer (tải PeerJS, mở kết nối) · host (chủ phòng: phòng chờ, phát sóng, hỏi quyết định từ xa) · guest (người vào phòng: đồng bộ, trả lời, tự kết nối lại)
```

Thiết kế chính:

- **Engine không biết người chơi ở đâu**: mọi quyết định đi qua `ask(player, kind, data)` (máy → AI; người trên máy này → hộp thoại; người từ xa → gửi qua mạng), mọi hiển thị đi qua `view.*`. Nhờ vậy chơi một máy và chơi trực tuyến dùng chung một engine.
- Trạng thái ván là một JavaScript object, lưu vào `localStorage` (khóa `cotyphu.save.v1`) ở đầu mỗi lần lắc; cài đặt và hồ sơ người chơi ở `cotyphu.settings.v1`; thông tin kết nối lại phòng ở `cotyphu.net.v1`.
- Bộ sinh số ngẫu nhiên có seed nằm trong trạng thái ván, nên tải lại trang giữa lượt sẽ cho cùng kết quả xúc xắc (không "lắc lại" được).
