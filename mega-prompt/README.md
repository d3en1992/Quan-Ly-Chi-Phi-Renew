# Cách chạy (anh Tình đọc file này)

## Các file
| File | Dùng làm gì |
|---|---|
| `GD01` … `GD12`, `GD99` | **Mega prompt từng giai đoạn (module).** Cuối mỗi file có mẫu báo cáo + **prompt tiếp theo, model, effort** |
| `00-QUY-TAC-CHUNG.md` | Luật chung + cách tiết kiệm token, mọi giai đoạn phải theo |
| `00-DIEU-PHOI.md` | Prompt chạy **tự động** cả chuỗi (dùng ban đêm khi anh ngủ) |
| `BAN-DO-APP-CU.md` | 1.515 hàm app cũ → file:dòng, để AI đọc đúng chỗ, khỏi đọc cả file |
| `DU-LIEU-CU.md` | Mọi bảng / trường / kiểu / ví dụ của dữ liệu cũ, khỏi mở JSON 2,5MB |
| `BAN-DO-GIAO-DIEN.md` | Màn nào của giao diện mẫu nằm ở dòng nào |
| `TIEN-DO.md` | AI ghi tiến độ, nhịp tim, lỗi, việc anh cần làm |
| `xuat-so-chuan.js` | Đoạn lệnh anh dán vào app cũ để xuất số lãi/lỗ chuẩn |

## Model và effort từng giai đoạn (đã hạ 1 nấc từ GD04 để tiết kiệm quota)
| Thứ tự | Giai đoạn | Model | Effort | Ghi chú |
|---|---|---|---|---|
| 1–3 | GD01, GD02, GD03 | Opus / Fable / Fable | medium / high / high | **Đã xong**, lệch 0 đồng |
| 4 | GD04 Công trình, Danh bạ, Danh mục | Sonnet 5.5 | medium | Màn hình theo mẫu |
| 5 | GD05 Nhập chi phí (lưới Excel) | **Fable 5.2** | medium | Fable thứ 1/2 |
| 6 | GD06 Chấm công | Opus 5.5 | medium | |
| 7 | GD07 Chi trả, Công nợ, Doanh thu, Quyết toán | **Fable 5.2** | medium | Fable thứ 2/2 |
| 8 | GD10 Điện thoại, PWA, bản thử online | Sonnet 5.5 | medium | |
| 9 | GD08 Thiết bị, Tỉ trọng, Thùng rác | Opus 5.5 | medium | |
| 10 | GD09 Chụp đa năng, Xuất Excel | Sonnet 5.5 | **high** | Sonnet high duy nhất |
| 11 | GD12 Tiến độ | Sonnet 5.5 | medium | |
| 12 | GD99 Kiểm tra cuối, báo cáo | Sonnet 5.5 | medium | |
| — | Điều phối tự động | Sonnet 5.5 | medium | Chỉ giao việc |
| — | Sửa lỗi nhỏ sau này | Sonnet 5.5 | low / medium | |

Fable hết quota thì đổi giai đoạn đó sang **Opus 5.5, effort medium**.

## Hai cách chạy
**Cách 1 — Từng bước (ban ngày, anh ở máy, tiết kiệm nhất):**
1. Mở session **mới** trong `ban-moi`, chọn model + effort theo bảng, quyền **Bypass**.
2. Dán: `Đọc mega-prompt/00-QUY-TAC-CHUNG.md rồi làm mega-prompt/GD01-khung-app.md`
3. Làm xong, AI trả lời: đã xong gì, lỗi còn gì, anh cần làm gì, và **prompt tiếp theo + model + effort**. Anh mở session mới, chọn đúng model / effort, dán prompt đó.

**Cách 2 — Tự động (ban đêm, anh ngủ):**
1. Mở session mới trong `ban-moi`, chọn **Sonnet 5.5**, effort **medium**, quyền **Bypass**.
2. Dán phần trong khung của `00-DIEU-PHOI.md`. Nó tự làm tiếp từ giai đoạn đang dở (đọc `TIEN-DO.md`), tự chọn model + effort cho từng giai đoạn.

Đổi từ cách 1 sang cách 2 lúc nào cũng được, vì cả hai cùng đọc / ghi `TIEN-DO.md`.

## Việc anh làm trước khi chạy GD01 (khoảng 20–30 phút)
Bắt buộc trước **GD02**:
1. **Snapshot mới nhất:** app cũ → Danh Mục → Xuất JSON → lưu thành `ban-moi\du-lieu\snapshot.json`.
2. **Số chuẩn:** app cũ (Chrome, máy tính) → chọn **Tất cả năm**, chờ đồng bộ xanh → F12 → Console → dán toàn bộ `xuat-so-chuan.js` → Enter → file `so-chuan.json` tải về → chép vào `ban-moi\du-lieu\so-chuan.json`.
3. **Đổi mật khẩu ADMIN của app cũ.**

Nên làm (không có thì AI vẫn chạy trên máy, chỉ chưa xem được trên điện thoại / chưa chụp hóa đơn thật):
4. GitHub: repo `Quan-Ly-Chi-Phi-Renew` → Settings → Danger Zone → **Make private**.
5. Supabase: tạo project **`qlcp-thu`** (Singapore), tự dán vào `ban-moi\.env`: `SUPABASE_TEST_URL`, `SUPABASE_TEST_ANON_KEY`, `SUPABASE_TEST_SERVICE_ROLE_KEY`, `SUPABASE_TEST_DB_URL`.
6. Gemini: key miễn phí từ Google AI Studio → `GEMINI_API_KEY=…` vào `ban-moi\.env` (CCCD dùng key trả phí thì thêm `GEMINI_API_KEY_PAID`).
7. Vercel: project `quan-ly-chi-phi-test` → Settings → Git: kiểm tra đang nối repo `Quan-Ly-Chi-Phi-Renew`.

⚠️ Key chỉ dán vào file `.env` trên máy anh, không gửi vào chat.

## Trước khi đi ngủ (nếu chạy cách 2)
Cắm sạc, tắt chế độ ngủ của máy, **để app Claude mở**. Hết quota thì session dừng; hẹn giờ tiếp sức (nếu đã cài) mỗi giờ sẽ tự chạy tiếp.

## Sáng mai
Mở `ban-moi\BAO-CAO-SANG.md` và `mega-prompt\TIEN-DO.md`.
