# 🎲 Cờ Tỷ Phú — Vòng Quanh Thế Giới

Board game kinh doanh 32 ô với **bàn cờ 3D góc nhìn isometric**, chạy **hoàn toàn trên trình duyệt**: mua đất, xây nhà, dựng Biểu Tượng, thâu tóm thành phố của đối thủ và giành độc quyền để trở thành tỷ phú duy nhất.

- **Không backend, không database** — chỉ file tĩnh (HTML + CSS + ES modules), chạy thẳng trên GitHub Pages.
- **Bàn cờ 3D** dựng bằng CSS 3D transforms trên nền trời sáng: ô có độ dày, công trình bo tròn tô màu chủ sở hữu (cờ Đất nền → Nhà cấp 1 → Nhà cấp 2 → Khách sạn → tháp Biểu Tượng mái vòm vàng), bãi biển có cây dừa và dù, quân cờ hình thú tròn trịa có tay chân, xúc xắc 3D lăn trên mặt bàn. Có thể đổi sang **góc nhìn 2D** phẳng (mặc định trên điện thoại dọc).
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

1. Vào **Settings → Pages**, mục *Build and deployment* chọn **Deploy from a branch**, nhánh `main`, thư mục `/ (root)` (chỉ cần làm 1 lần).
2. Mỗi lần nhánh `main` thay đổi, GitHub tự build và deploy lại (xem ở tab **Actions → pages build and deployment**). File `.nojekyll` giúp GitHub phục vụ nguyên các file tĩnh, không xử lý Jekyll.
3. Sau khoảng 1 phút, game có tại `https://<tên-tài-khoản>.github.io/<tên-repo>/` (repo này: https://duylinh180998.github.io/tiphu/).

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
- **Hai đường kết nối, tự chọn:** khách thử nối thẳng tới chủ phòng (WebRTC) trước; nếu sau 10 giây không được (khác mạng, 4G, tường lửa…) thì tự chuyển sang **kênh chuyển tiếp** qua các máy chủ MQTT công cộng miễn phí (EMQX, HiveMQ, Eclipse, Mosquitto) bằng WebSocket bảo mật — đi qua được hầu hết mạng, **không cần tài khoản**. Nếu máy chủ PeerJS không dùng được, phòng vẫn mở được chỉ với kênh chuyển tiếp.
- Kênh chuyển tiếp dùng máy chủ công cộng: người biết mã phòng có thể nhìn thấy dữ liệu ván đấu (chỉ là trạng thái bàn cờ). Chủ phòng vẫn kiểm tra mọi lựa chọn nhận được.
- Thử ép dùng kênh chuyển tiếp: thêm `?net=relay` vào đường link. Dùng máy chủ MQTT riêng: `?mqtt=wss://may-chu-cua-ban/mqtt`.
- Tùy chọn: có thể thêm máy chủ TURN (`TURN_CREDENTIALS_URL` / `TURN_SERVERS` trong `js/config.js`) để kết nối thẳng thành công nhiều hơn, nhưng không bắt buộc.
- Khi không vào được, trò chơi báo lỗi: không tìm thấy phòng (sai mã / phòng đã đóng) hoặc không kết nối được Internet.
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

Mỗi người bắt đầu với **$2M**. Ván đấu mặc định **30 vòng**, nhưng thường kết thúc sớm hơn nhờ các điều kiện thắng tức thì.

### 🎲 Lượt chơi
- Lắc 2 xúc xắc rồi đi theo chiều kim đồng hồ. Đổ **đôi** được lắc thêm lượt sau khi xử lý xong ô vừa đến; đổ đôi **3 lần liên tiếp** bị đưa thẳng ra Đảo Hoang (không xử lý ô thứ 3).
- 🎯 **Chẵn/Lẻ**: mỗi người có **3 lần** chọn trước khi lắc để tổng 2 xúc xắc chắc chắn là số chẵn (2, 4, …, 12) hoặc số lẻ (3, 5, …, 11) — dùng để nhắm ô cần tới hoặc né nhà đối thủ.

### 🏙️ Thành phố — 5 cấp công trình
| Cấp | Công trình | Chi phí | Tiền thuê |
|-----|-----------|---------|-----------|
| 1 | 🚩 Đất nền | 50% giá gốc | 10% |
| 2 | 🏠 Nhà cấp 1 | +50% | 35% |
| 3 | 🏘️ Nhà cấp 2 | +50% | 90% |
| 4 | 🏨 Khách sạn | +50% | 175% |
| 5 | 🗼 **Biểu Tượng** | +100% | 320% |

- 🔒 **Mở khóa theo vòng** (số lần đã đi qua ô Bắt Đầu của từng người):
  - **Vòng 1** (chưa qua lần nào): chỉ mua được **Đất nền** — đầu ván trên bàn chỉ có đất cắm cờ màu.
  - **Vòng 2**: mở thêm **Nhà cấp 1** và **Nhà cấp 2**.
  - **Từ vòng 3**: mở **Khách sạn**; dừng ở đất trống và đủ tiền thì xây một mạch từ Đất nền lên Khách sạn.
- Dừng lại thành phố của mình: nâng tiếp tới mức đã mở khóa; đang là Khách sạn thì được xây **Biểu Tượng**.
- **Biểu Tượng** không bao giờ xây ngay khi mới mua đất. Thành phố phải là Khách sạn, sau đó: dừng lại ô đó lần nữa, **dừng đúng ô Bắt Đầu**, hoặc **mua đứt** một Khách sạn của đối thủ rồi nâng ngay.
- 🎨 **Độc quyền nhóm màu**: sở hữu trọn bộ thành phố cùng màu (2 hoặc 3 ô) → tiền thuê của cả nhóm **x2**.
- Tiền thuê = thuê theo cấp × độc quyền màu (x2) × Lễ Hội (x2…x5, hoặc Lễ Hội Đường Phố x2).

### 💥 Mua đứt
- Dừng ở thành phố đối thủ: trả tiền thuê trước, rồi được quyền trả **gấp đôi giá trị đầu tư hiện tại** (trả thẳng cho chủ cũ) để mua đứt, sau đó nâng cấp tiếp ngay trong lượt.
- Thành phố đã là **Biểu Tượng** và cả 4 khu nghỉ dưỡng **không thể** bị mua đứt.

### ⭐ Ô đặc biệt
- 🏁 **Bắt Đầu**: đi qua hoặc dừng lại đều nhận **$300K**. Dừng đúng ô được trả tiền nâng 1 thành phố của mình thêm **1 cấp** (rất hợp để nâng Khách sạn lên Biểu Tượng từ xa).
- 🏝️ **Đảo Hoang**: kẹt **3 lượt**. Đầu lượt chọn trả **$200K** hoặc lắc tìm **đôi** (ra đôi thì đi luôn nhưng không được thêm lượt). Thẻ Thoát Đảo Hoang tự dùng khi rơi vào đảo. Hết 3 lượt thì lượt sau tự đi, không mất tiền.
- 🎉 **Lễ Hội Thế Giới**: chọn 1 thành phố của mình tổ chức Lễ Hội — tiền thuê **x2**, các lần tổ chức sau **x3, x4, x5**. Mỗi lúc chỉ có 1 thành phố tổ chức.
- 🎊 **Lễ Hội Đường Phố** (sự kiện ngẫu nhiên): xuất hiện lần đầu ở một vòng ngẫu nhiên (vòng 2–4) tại 1 thành phố (ưu tiên thành phố đã có chủ) — tiền thuê **x2** trong **2 vòng**, rồi tự chuyển sang thành phố khác. Nếu thành phố đó đang có Lễ Hội Thế Giới thì chỉ tính hệ số Lễ Hội Thế Giới.
- ✈️ **Chuyến Bay Thế Giới**: lượt kế tiếp trả **$50K** để bay tới bất kỳ ô nào (bay qua Bắt Đầu vẫn nhận lương); không đủ tiền thì lắc như thường.
- 🏖️ **Khu Nghỉ Dưỡng** (ô 4, 12, 20, 28): giá $200K, không xây nhà; thuê **$50K / $100K / $200K** khi chủ sở hữu 1 / 2 / 3 khu. Đủ 4 khu là **thắng ngay**.
- 💸 **Thuế** (ô 30): nộp **10% tổng tài sản** (tiền mặt + giá trị bất động sản).

### 🎁 Thẻ Cơ Hội (ô 6, 14, 22)
| Thẻ | Tác dụng |
|-----|----------|
| 🌋 Động Đất | Chọn 1 thành phố của đối thủ, phá 1 cấp công trình (Biểu Tượng bị hạ xuống Khách sạn và mất bảo hộ) |
| 🔌 Mất Điện | Chọn 1 thành phố: không thu được tiền thuê trong 3 vòng |
| 📜 Cưỡng Chế Bán | Chọn 1 thành phố của đối thủ (chưa là Biểu Tượng): buộc bán lại cho ngân hàng |
| 🏷️ Giảm Giá 50% | Giữ lại: lần mua đất / xây nhà / mua đứt tiếp theo chỉ trả một nửa |
| 🛶 Thoát Đảo Hoang | Giữ lại: tự dùng khi rơi vào Đảo Hoang |
| 🎉 Vé Lễ Hội · 🎫 Vé Máy Bay · 🏁 Về Bắt Đầu · 🌊 Đắm Tàu | Di chuyển ngay tới ô Lễ Hội / Chuyến Bay / Bắt Đầu / Đảo Hoang |

### 🆘 Thanh lý & phá sản
- Không đủ tiền trả: hộp thoại bắt buộc chọn bán thành phố / khu nghỉ dưỡng cho ngân hàng với giá **50% số tiền đã đầu tư**; ô bán xong trở về đất trống không chủ (có nút gợi ý tự động).
- Tiền mặt + 50% giá trị toàn bộ tài sản vẫn không đủ → **phá sản**, bị loại; số tiền thanh lý thuộc về chủ nợ (hoặc ngân hàng nếu nợ thuế).
- Ván không giới hạn vòng: từ **vòng 41** tiền thuê tăng thêm **5% mỗi vòng** để ván luôn có hồi kết.

### 🏆 5 cách chiến thắng
1. **Người trụ lại cuối cùng** — mọi đối thủ đều phá sản.
2. **Độc quyền 3 màu** — sở hữu trọn vẹn 3 nhóm màu thành phố bất kỳ.
3. **Độc quyền 1 cạnh** — sở hữu toàn bộ thành phố và khu nghỉ dưỡng trên cùng 1 cạnh bàn cờ.
4. **Độc quyền du lịch** — sở hữu cả 4 Khu Nghỉ Dưỡng.
5. **Hết vòng** (mặc định 30; có thể chọn 20 / 50 / không giới hạn) — người có tổng tài sản (tiền mặt + giá trị bất động sản) lớn nhất thắng.

## 🎮 Điều khiển
- **Space / Enter**: lắc xúc xắc hoặc chọn nút chính của hộp thoại.
- **Rê chuột / chạm vào ô**: xem chi tiết (chủ sở hữu, bảng giá & tiền thuê từng cấp, giá mua đứt).
- **Nhấn vào thẻ người chơi**: xem danh sách tài sản của người đó.
- Thanh công cụ: âm thanh · tốc độ (Chậm / Thường / Nhanh / Siêu tốc) · góc nhìn **3D / 2D** · nhật ký · biểu cảm (trực tuyến) · luật chơi · menu.

## 🤖 AI của máy
Máy tự quyết định mua đất (giữ tiền dự phòng theo mức thuê nguy hiểm nhất trên bàn), dùng Chẵn/Lẻ khi việc đó giúp né tiền thuê lớn hoặc nhắm ô quan trọng, nâng cấp, xây Biểu Tượng, chọn mục tiêu cho thẻ Động Đất / Mất Điện / Cưỡng Chế Bán, mua đứt thành phố để hoàn thành nhóm màu hoặc phá thế độc quyền của đối thủ, chọn điểm bay, chọn thành phố tổ chức Lễ Hội, cân nhắc ở lại Đảo Hoang khi bàn cờ quá nguy hiểm, và bán tài sản ít giá trị nhất khi thiếu tiền. Khi chơi trực tuyến, cùng AI này chơi thay người mất kết nối.

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
  net/                  peer (tải PeerJS, mở kết nối) · relay (kênh chuyển tiếp MQTT dự phòng) · host (chủ phòng: phòng chờ, phát sóng, hỏi quyết định từ xa) · guest (người vào phòng: đồng bộ, trả lời, tự kết nối lại)
```

Thiết kế chính:

- **Engine không biết người chơi ở đâu**: mọi quyết định đi qua `ask(player, kind, data)` (máy → AI; người trên máy này → hộp thoại; người từ xa → gửi qua mạng), mọi hiển thị đi qua `view.*`. Nhờ vậy chơi một máy và chơi trực tuyến dùng chung một engine.
- Trạng thái ván là một JavaScript object, lưu vào `localStorage` (khóa `cotyphu.save.v1`) ở đầu mỗi lần lắc; cài đặt và hồ sơ người chơi ở `cotyphu.settings.v1`; thông tin kết nối lại phòng ở `cotyphu.net.v1`.
- Bộ sinh số ngẫu nhiên có seed nằm trong trạng thái ván, nên tải lại trang giữa lượt sẽ cho cùng kết quả xúc xắc (không "lắc lại" được).
