# TN02 — Xuất dữ liệu tùy biến — BỘ HỒ SƠ (12/11/2026)

Thay thế **TN01** (đã bỏ, không code). TN02 làm **chung session với GD09**.

## 01-yeu-cau/
| File | Nội dung |
|---|---|
| `GD09-moi-gop-TN02.md` | File GD09 mới: Phần A (chụp đa năng) + Phần B (TN02). Chép đè `mega-prompt/GD09-…` cũ. |

## 02-dac-ta/
| File | Nội dung |
|---|---|
| `TN02-dac-ta.md` | Đặc tả **v2** (~460 dòng): bố cục màn, **thứ tự nhóm sắp theo tần suất dùng (mục 1.6)**, 29 loại dữ liệu, 3 nhóm lọc, 3 kiểu gom, quyền dữ liệu cá nhân, giới hạn, 11 mục kiểm tra, **dữ liệu thật snapshot 12/11 (mục 0b)**. |

## 03-file-mau/ (10 file Excel, dữ liệu thật snapshot 03/11)
| File | Kiểm điều gì | Số liệu |
|---|---|---|
| `01_MotCongTrinh_TatCaNam_CT-Co-Sau.xlsx` | Kiểu gom cơ bản, 6 khối dọc, có cả 2 kiểu chấm công | 210 HĐ · 245 dòng CN |
| `02_MotLoai_HD_NhieuCongTrinh_Gop1Sheet.xlsx` | Một loại × nhiều CT, cột CÔNG TRÌNH đứng thứ 2 | 477 hóa đơn · 3 CT |
| `03_LocTheoThang_HD_06-2025_3CT.xlsx` | Bộ lọc thời gian theo tháng | 23 hóa đơn |
| `04_NhomC_DanhBa_LocTheoCongTrinh.xlsx` | **Nhóm C** — danh bạ lọc theo phát sinh | 19 công nhân (không phải 51) |
| `05_NhomB_DongVatTu_NoiQuaHoaDon.xlsx` | **Nhóm B** — bảng con nối qua bảng cha | 788 dòng vật tư |
| `06_NhieuLoai_1CongTrinh_MoiLoai1Sheet.xlsx` | Mỗi loại 1 sheet (có 1 sheet rỗng do CT không có thiết bị) | 7 sheet |
| `07_DuLieuCaNhan_ChiNguoiCoQuyen.xlsx` | Dòng cảnh báo đỏ + cột SĐT/CCCD/STK | 18 người |
| `08_XuatTatCa_36CT_CoTongHop.xlsx` | Xuất tất cả + sheet TONG HOP | 36 CT · 6,44 tỷ hóa đơn |
| `09_ManHinh_XuatDuLieu_MoPhong.xlsx` | Bố cục màn hình bằng ô Excel | — |
| `10_KiemChung_ChiTietVsGop_VsSoChuan.xlsx` | **Kiểm chứng số** | chi tiết vs gộp lệch **0**; trả NCC lệch **0** |
| `00-PhienBanCu_*.xlsx` | Bản cũ trước khi chốt (để so) | — |

## 05-giao-dien/
| File | Nội dung |
|---|---|
| `tab-xuat-du-lieu.html` | **Mô phỏng giao diện v2 chạy được** — mở bằng trình duyệt. Đã sắp lại: nhóm hay xuất lên trên, danh bạ gấp lại. |
| `v2-01-3cot.png` | Ảnh 3 cột + thanh đáy (bản v2) |
| `v2-02-giaithich.png` | Phần giải thích 3 nhóm lọc + dữ liệu cá nhân |
| `v2-03-lichsu.png` | Bảng dữ liệu thật + lịch sử xuất |
| `01-3cot.png`, `02-cot2-tron.png` | Ảnh bản v1 (giữ để so sánh — 5 nhóm đều nhau, chưa sắp lại) |

## Dữ liệu thật (cập nhật 12/11/2026)
Snapshot mới nhất: `ban-moi/du-lieu/cpct_snapshot_2026-11-12_08-19.json` — 3,47 MB, 23 store.

Còn sống: **1.189 hóa đơn** · **37 công trình** (gồm CÔNG TY) · **350 tuần chấm công** · **2.077 dòng công nhân** · **30 HĐ thầu phụ** · **83 phiếu thu** · **314 phiếu chi** · **119 thiết bị** · **30 khách hàng** · **52 công nhân**.

Hóa đơn trải **01/01/2025 → 11/11/2026**. 6 lô nhập 2024–2025 đã `removed/purged` — **không còn dữ liệu nháp**.

## Khi làm thật — dùng gì
- **ExcelJS** (không phải SheetJS: bản miễn phí không tô nền / kẻ viền / merge ô)
- Tái dùng `calc/payroll.ts` (gộp chấm công — GD06), `calc/payables.ts` (chia tiền NCC — GD07)
- **Không** làm lại: ảnh phiếu chi/thu/HĐ thầu phụ (GD07 `voucher.ts`), phiếu lương gửi Zalo dạng chữ (GD06)

## Lưu ý ổ D
Ổ D **read-only** từ WSL → phải chép file sang `D:\10-CONG-VIEC\app-quan-ly-cong-trinh\code\ban-moi-tinh-nang-moi\` bằng Windows.
