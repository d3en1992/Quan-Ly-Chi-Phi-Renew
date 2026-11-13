# TỪ ĐIỂN DỮ LIỆU APP CŨ (tự sinh từ snapshot 02/11/2026)

Dùng cho GĐ2 (chuyển dữ liệu): **khỏi phải mở file JSON 2,5MB**. Mỗi bảng: số bản ghi còn sống, từng trường, kiểu, tỉ lệ có giá trị, ví dụ.
File snapshot: `{"meta":…, "data":{ <key>: … }}`. Bản ghi có `deletedAt` khác null = đã xóa mềm; có `purgedAt` = bia mộ (bỏ).

## `inv_v3` — 900 bản ghi, 890 còn sống
| trường | kiểu | có giá trị | ví dụ |
|---|---|---|---|
| `id` | chữ | 890/890 | "124480af-a52b-4007-b84a-da27d93d689f" |
| `createdAt` | số | 890/890 | 1793331281331 |
| `updatedAt` | số | 890/890 | 1793331318911 |
| `deletedAt` | null | 0/890 | null |
| `deviceId` | chữ | 890/890 | "58bdcdd8-c12d-4905-8f3e-55f744679613" |
| `ngay` | chữ | 890/890 | "2026-10-29" |
| `congtrinh` | chữ | 890/890 | "SC Nhà Tình Đăng - 213 Quang Trung, GV" |
| `loai` | chữ | 890/890 | "Vật Tư Hoàn Thiện Sàn" |
| `nguoi` | chữ | 871/890 | "TÌNH" |
| `ncc` | chữ | 870/890 | "COPHA TÂN THÀNH" |
| `nd` | chữ | 890/890 | "Ván Keo 2m4, Phí vận chuyển/Khác" |
| `tien` | số | 890/890 | 1540000 |
| `thanhtien` | số | 886/890 | 1540000 |
| `footerCkStr` | chữ | 0/890 | null |
| `items` | mảng | 518/890 | [{"ten": "Ván Keo 2m4", "dv": "bộ", "sl": 2, "dongia": 67… |
| `source` | chữ | 890/890 | "detail" |
| `projectId` | chữ | 890/890 | "4ecf1759-c72a-4f81-9e11-c551d0ef5c1d" |
| `loaiId` | chữ | 890/890 | "3cc11e18-356d-44cc-8230-996200160239" |
| `nccId` | chữ/null | 870/890 | "50722ab2-67a1-43e6-8b8e-2dbcd067913f" |
| `nguoiId` | chữ/null | 871/890 | "c29b9719-9a7e-4e0e-b2f2-272f0427acf1" |
| `_ts` | số | 337/890 | 1775209214344 |
| `soHD` | chữ | 0/890 | null |

## `inv_v3[].items[]` — 1556 bản ghi, 1556 còn sống
| trường | kiểu | có giá trị | ví dụ |
|---|---|---|---|
| `ten` | chữ | 1553/1556 | "Ván Keo 2m4" |
| `dv` | chữ | 1510/1556 | "bộ" |
| `sl` | số | 1556/1556 | 2 |
| `dongia` | số | 1556/1556 | 670000 |
| `ck` | chữ | 0/1556 | null |
| `thanhtien` | số | 1556/1556 | 1340000 |
| `nguoith` | chữ | 6/1556 | "KS LAM" |

`inv_v3.source`: {'detail': 518, 'quick': 341, 'excel_invQ': 31}

## `cc_v2` — 350 bản ghi, 346 còn sống
| trường | kiểu | có giá trị | ví dụ |
|---|---|---|---|
| `id` | chữ | 346/346 | "9cc1ac09-86b3-4e56-ba33-730c382a8ea0" |
| `createdAt` | số | 346/346 | 1793436869381 |
| `updatedAt` | số | 346/346 | 1793436869381 |
| `deletedAt` | null | 0/346 | null |
| `deviceId` | chữ | 346/346 | "64775647-caa7-40f7-a49a-4ac86223720f" |
| `fromDate` | chữ | 346/346 | "2026-10-25" |
| `toDate` | chữ | 346/346 | "2026-10-31" |
| `ct` | chữ | 346/346 | "CT Nhà Tình (925 Âu Cơ, TP)" |
| `ctPid` | chữ | 346/346 | "8b4470e1-900a-4d06-8041-b67a1ed4b095" |
| `projectId` | chữ | 346/346 | "8b4470e1-900a-4d06-8041-b67a1ed4b095" |
| `workers` | mảng | 346/346 | [{"name": "HOÀNG PM", "luong": 450000, "d": [0, 0, 0.5, 0… |
| `deletedBy` | null | 0/346 | null |

## `cc_v2[].workers[]` — 2057 bản ghi, 2057 còn sống
| trường | kiểu | có giá trị | ví dụ |
|---|---|---|---|
| `name` | chữ | 2057/2057 | "HOÀNG PM" |
| `luong` | số | 2057/2057 | 450000 |
| `d` | mảng | 2057/2057 | [0, 0, 0.5, 0, 0, 0, 0] |
| `phucap` | số | 2057/2057 | 30000 |
| `hdmuale` | số | 2057/2057 | 0 |
| `loanAmount` | số | 692/2057 | 0 |
| `nd` | chữ | 153/2057 | "Xăng xe chở đồ" |
| `role` | chữ | 661/2057 | "P" |
| `tru` | số | 2057/2057 | 0 |
| `cnId` | chữ | 2057/2057 | "96f1fa88-5b56-48bd-9f97-e21e23496eac" |
| `debtBefore` | số | 88/2057 | 0 |

## `tb_v1` — 214 bản ghi, 119 còn sống
| trường | kiểu | có giá trị | ví dụ |
|---|---|---|---|
| `id` | chữ | 119/119 | "09f214ca-b6ff-4afd-bd50-8182c78f1cb7" |
| `ct` | chữ | 119/119 | "CÔNG TY" |
| `ten` | chữ | 119/119 | "Chân Dàn 1.5m" |
| `soluong` | số | 119/119 | 45 |
| `tinhtrang` | chữ | 119/119 | "Đang hoạt động" |
| `nguoi` | chữ | 0/119 | null |
| `ghichu` | chữ | 10/119 | "Máy cũ" |
| `ngay` | chữ | 119/119 | "2026-10-02" |
| `projectId` | chữ | 119/119 | "COMPANY" |
| `updatedAt` | số | 119/119 | 1790934086599 |
| `createdAt` | số | 119/119 | 1775921137490 |
| `deletedAt` | null | 0/119 | null |
| `deviceId` | chữ | 119/119 | "92ae2319-41af-4137-b810-323efc580e30" |
| `tenId` | chữ | 119/119 | "ccdf13c5-2dbd-4fb5-a8dc-e578d7102fe2" |
| `kho` | chữ | 39/119 | "TB" |

## `ung_v1` — 200 bản ghi, 186 còn sống
| trường | kiểu | có giá trị | ví dụ |
|---|---|---|---|
| `id` | chữ | 186/186 | "99f3c9a2-f6aa-4fe9-ab96-b09e287ed85c" |
| `createdAt` | số | 186/186 | 1793529946597 |
| `updatedAt` | số | 186/186 | 1793529946597 |
| `deletedAt` | null | 0/186 | null |
| `deviceId` | chữ | 186/186 | "58bdcdd8-c12d-4905-8f3e-55f744679613" |
| `ngay` | chữ | 186/186 | "2026-11-01" |
| `loai` | chữ | 186/186 | "congnhan" |
| `cnKind` | chữ | 41/186 | "ung" |
| `tp` | chữ | 186/186 | "HIỀN" |
| `congtrinh` | chữ | 186/186 | "CT A Huynh (PTH, TP)" |
| `projectId` | chữ | 186/186 | "59c2eb95-192b-4505-bc12-6a7775542c6d" |
| `tien` | số | 186/186 | 2000000 |
| `nd` | chữ | 156/186 | "Ứng tiền" |
| `tinhVaoThucLanh` | bool | 38/186 | true |
| `tpId` | chữ | 186/186 | "535ce3e9-756e-47ab-826d-6815e07665a1" |
| `nguoi` | chữ | 4/186 | "TÌNH" |
| `autoSettle` | bool | 4/186 | true |
| `settleId` | chữ | 4/186 | "tt_mutxfc90_z15y" |
| `settledBy` | chữ | 4/186 | "ADMIN" |

`ung_v1` theo (loai, cnKind): ('congnhan', 'ung'): 18, ('thauphu', None): 80, ('congnhan', 'tra'): 23, ('nhacungcap', None): 64, ('congnhan', None): 1

## `thu_v1` — 78 bản ghi, 76 còn sống
| trường | kiểu | có giá trị | ví dụ |
|---|---|---|---|
| `id` | chữ | 76/76 | "f75ca2cb-8531-48cc-b11e-455d4f290b9a" |
| `createdAt` | số | 76/76 | 1792940329732 |
| `updatedAt` | số | 76/76 | 1792940329732 |
| `deletedAt` | null | 0/76 | null |
| `deviceId` | chữ | 76/76 | "64775647-caa7-40f7-a49a-4ac86223720f" |
| `ngay` | chữ | 76/76 | "2026-10-24" |
| `congtrinh` | chữ | 76/76 | "CT A Huynh (PTH, TP)" |
| `projectId` | chữ | 76/76 | "59c2eb95-192b-4505-bc12-6a7775542c6d" |
| `tien` | số | 76/76 | 19400000 |
| `nguoi` | chữ | 76/76 | "TÌNH" |
| `nd` | chữ | 76/76 | "Thu tiền tô tường 64 Phú Thọ Hòa" |
| `loaiThu` | chữ | 49/76 | "khac" |
| `nguoiId` | chữ | 76/76 | "c29b9719-9a7e-4e0e-b2f2-272f0427acf1" |
| `auto` | bool | 6/76 | true |
| `qtId` | chữ | 6/76 | "29f0572d-19dd-4852-8842-12e167e3246f" |

## `cat_ct` — mảng 36 phần tử: ["CT Nhà Tình (925 Âu Cơ, TP)", "SC Chú Thỉ (24 MGX, BT)"…

## `cat_loai` — mảng 44 phần tử: ["Nhân Công", "Hóa Đơn Lẻ", "Thiết Kế - Xin Phép", "Đào Đ…

## `cat_ncc` — mảng 52 phần tử: ["VLXD PHƯƠNG", "BT TƯƠI NHIÊN", "VLXD HÙNG HUỆ", "XE MÚC…

## `cat_nguoi` — mảng 6 phần tử: ["TÌNH", "GIÁM ĐỐC", "KS LAM", "LONG", "TOÁN", "SƠN"]

## `cat_tp` — mảng 11 phần tử: ["TPDN BÉ", "TPDN HÀ", "TPSN ĐỎ", "THANG MÁY HOÀN CÔNG", …

## `cat_cn` — mảng 51 phần tử: ["BÍNH", "C TÂM", "CÒ", "CƯỜNG", "DƯƠNG", "HIẾU", "HIỀN",…

## `cat_tbteb` — mảng 52 phần tử: ["Máy Cắt Bàn", "Máy Uốn Sắt Lớn", "Chân Dàn 1.7m", "Chân…

## `projects_v1` — 42 bản ghi, 36 còn sống
| trường | kiểu | có giá trị | ví dụ |
|---|---|---|---|
| `id` | chữ | 36/36 | "8b4470e1-900a-4d06-8041-b67a1ed4b095" |
| `name` | chữ | 36/36 | "CT Nhà Tình (925 Âu Cơ, TP)" |
| `status` | chữ | 36/36 | "active" |
| `startDate` | chữ | 36/36 | "2026-01-03" |
| `endDate` | chữ/null | 28/36 | "2026-07-18" |
| `note` | chữ | 28/36 | "925/53 Âu Cơ, P Tân Sơn Nhì, TPHCM" |
| `createdAt` | số | 36/36 | 1774152154774 |
| `updatedAt` | số | 36/36 | 1793508029621 |
| `deletedAt` | null | 0/36 | null |
| `deviceId` | chữ | 18/36 | "b286ca37-9a77-4422-8f66-40f4ab61fded" |
| `closedDate` | chữ/null | 28/36 | "2026-09-04" |
| `startDateUserEdited` | bool | 34/36 | true |
| `customerId` | chữ/null | 29/36 | "60fff1b6-3d95-4483-a1f3-419ab036e573" |
| `chuDauTu` | chữ | 29/36 | "Tình" |
| `heSoTiTrong` | số | 30/36 | 1 |
| `khoiLuong` | mảng | 5/36 | [{"ten": "Trệt & Sân", "dvt": "m2", "kl": 60, "heSo": 1, … |
| `loaiCongTrinh` | chữ | 6/36 | "CT" |
| `type` | chữ | 21/36 | "CT" |
| `hangMuc` | chữ | 4/36 | "925 Âu Cơ, TP" |
| `completedDate` | chữ | 6/36 | "2026-07-18" |
| `createdYear` | số | 18/36 | 2026 |
| `aliases` | mảng | 2/36 | ["sn - a sang (le quat, tp)"] |

## `customers_v1` — 23 bản ghi, 23 còn sống
| trường | kiểu | có giá trị | ví dụ |
|---|---|---|---|
| `id` | chữ | 23/23 | "006fe1c5-7e28-4687-b2df-8885f0dd86ff" |
| `name` | chữ | 23/23 | "Thầy Phước" |
| `phone` | chữ | 2/23 | "0909496546" |
| `email` | chữ | 0/23 | null |
| `address` | chữ | 23/23 | "781/20 Lạc Long Quân, P Bảy Hiền, TPHCM" |
| `taxCode` | chữ | 0/23 | null |
| `note` | chữ | 0/23 | null |
| `createdAt` | số | 23/23 | 1783004100436 |
| `updatedAt` | số | 23/23 | 1791104677990 |
| `deletedAt` | null | 0/23 | null |

## `quyettoan_v1` — 19 bản ghi, 14 còn sống
| trường | kiểu | có giá trị | ví dụ |
|---|---|---|---|
| `id` | chữ | 14/14 | "82eb9052-cf91-4e90-ae49-07405c4d6790" |
| `createdAt` | số | 14/14 | 1792937948571 |
| `updatedAt` | số | 14/14 | 1792937948571 |
| `deletedAt` | null | 0/14 | null |
| `deviceId` | chữ | 14/14 | "64775647-caa7-40f7-a49a-4ac86223720f" |
| `ngay` | chữ | 14/14 | "2026-10-23" |
| `congtrinh` | chữ | 14/14 | "SN C Hương (Chống thấm)" |
| `projectId` | chữ | 14/14 | "d88253f4-44e7-4ca2-a8f0-c732f5b5b610" |
| `loai` | chữ | 13/14 | "thaythe" |
| `giaTri` | số | 14/14 | 2250000 |
| `nd` | chữ | 14/14 | "Tất toán" |
| `nguoi` | chữ | 14/14 | "TÌNH" |
| `chot` | bool | 13/14 | true |

## `tytrong_v1` — 14 bản ghi, 9 còn sống
| trường | kiểu | có giá trị | ví dụ |
|---|---|---|---|
| `id` | chữ | 9/9 | "2e0c7264-4693-4c81-9137-8991b091753c" |
| `createdAt` | số | 9/9 | 1793037122746 |
| `updatedAt` | số | 9/9 | 1793037122746 |
| `deletedAt` | null | 0/9 | null |
| `deviceId` | chữ | 9/9 | "58bdcdd8-c12d-4905-8f3e-55f744679613" |
| `kind` | chữ | 3/9 | "dinhmuc" |
| `ten` | chữ | 2/9 | "Định mức — CT A Hoàng (Hóc Môn)" |
| `loaiCT` | chữ | 1/9 | "CT" |
| `nguonPid` | chữ | 2/9 | "d6517b9d-3b56-4486-a394-e8d3521f2e7b" |
| `nguonTen` | chữ | 2/9 | "CT A Hoàng (Hóc Môn)" |
| `nam` | chữ | 2/9 | "Trọn vòng đời" |
| `tongSan` | số | 2/9 | 224.63 |
| `tongChi` | số | 2/9 | 833077700 |
| `dgTong` | số | 2/9 | 3708666 |
| `dgLoai` | object | 2/9 | {"Nhân Công": 1414148, "Vật Liệu Xây Dựng": 859979, "Sắt … |
| `dgNhom` | object | 2/9 | {"1": 3651372, "2": 6989, "3": 0, "4": 50305} |
| `dgRo1` | số | 2/9 | 3651372 |
| `ro1` | object | 2/9 | {"sat": 516403, "bt": 1186427, "nc": 1414148, "tp": 44957… |
| `nhapTay` | bool | 2/9 | false |
| `projectId` | chữ | 6/9 | "61fdf5ec-b7e1-4aaa-8a2d-2c7e8b0c6ac0" |
| `giaiDoan` | mảng | 6/9 | [{"id": "gmuwwc4tah6gg", "ten": "Tiền thi công", "tu": ""… |
| `hangMuc` | mảng | 6/9 | [{"id": "hmuwwc4taekkr", "gdId": "gmuwwc4tah6gg", "ten": … |
| `phanBo` | object | 1/9 | {"cc/2026-07-19/8b4470e1-900a-4d06-8041-b67a1ed4b095/nhan… |
| `roLoai` | object | 1/9 | {"phu cap an uong": 1, "khac": 2, "tiep dia - chong set": 2} |
| `roLuat` | mảng | 1/9 | [{"id": "rd0", "loai": "Điện Nước", "tuKhoa": "bóng đèn, … |
| `truLoai` | object | 0/9 | null |
| `quyMuc` | số | 1/9 | 50000 |
| `nhomLoai` | object | 1/9 | {"khac": 4, "thau phu": 1} |
| `nhomLuat` | mảng | 1/9 | [{"id": "nd0", "loai": "Điện Nước", "tuKhoa": "bóng đèn, … |
| `luat` | mảng | 3/9 | [{"id": "rmuw69zhy1xui", "truong": "nd", "giaTri": "móng"… |
| `theoHdtp` | object | 2/9 | {"a1519342-dc7f-4c91-8092-75a0ab499e2f": {"g": "gmuvbc234… |
| `roTay` | object | 2/9 | {"inv:fdd96a41-0ba2-445b-881e-421001f0b8ce": 1} |
| `nhomTay` | object | 2/9 | {"inv:fdd96a41-0ba2-445b-881e-421001f0b8ce": 1, "inv:3b7f… |

## `hopdong_v1` — object, 13 khóa
Ví dụ: `"8b4470e1-900a-4d06-8041-b67a1ed4b095"` → {"giaTri": 2254840000, "giaTriphu": 0, "phatSinh": 0, "ng…; `"4b02fc79-f866-4a58-b872-d5c3bd2197cc"` → {"giaTri": 136900000, "giaTriphu": 277900000, "phatSinh":…; `"b763226e-9b7f-4851-a55e-6e937f6d37b6"` → {"giaTri": 535000000, "giaTriphu": 0, "phatSinh": 0, "ngu…

## `hopdong_v1[<projectId hoặc tên CT>]` — 13 bản ghi, 13 còn sống
| trường | kiểu | có giá trị | ví dụ |
|---|---|---|---|
| `giaTri` | số | 13/13 | 2254840000 |
| `giaTriphu` | số | 13/13 | 0 |
| `phatSinh` | số | 5/13 | 0 |
| `nguoi` | chữ | 13/13 | "TÌNH" |
| `projectId` | chữ | 13/13 | "8b4470e1-900a-4d06-8041-b67a1ed4b095" |
| `ngay` | chữ | 13/13 | "2026-01-03" |
| `createdAt` | số | 13/13 | 1774404368694 |
| `updatedAt` | số | 13/13 | 1791107659244 |
| `deletedAt` | null | 0/13 | null |
| `sl` | số | 5/13 | 1 |
| `donGia` | số | 5/13 | 0 |
| `items` | mảng | 2/13 | [{"name": "Trệt: 4x16 m", "donVi": "m2", "sl": 64, "donGi… |
| `nguoiId` | chữ | 13/13 | "c29b9719-9a7e-4e0e-b2f2-272f0427acf1" |
| `khachHang` | chữ | 12/13 | "Tình" |
| `nd` | chữ | 10/13 | "Sửa chữa ốp lát gạch và hoàn thiện nội thất" |

## `thauphu_v1` — 31 bản ghi, 29 còn sống
| trường | kiểu | có giá trị | ví dụ |
|---|---|---|---|
| `id` | chữ | 29/29 | "0c1eea70-66ae-4363-ac4d-bc1da9e5fc3a" |
| `createdAt` | số | 29/29 | 1792940743087 |
| `updatedAt` | số | 29/29 | 1792940743087 |
| `deletedAt` | null | 0/29 | null |
| `deviceId` | chữ | 29/29 | "64775647-caa7-40f7-a49a-4ac86223720f" |
| `ngay` | chữ | 29/29 | "2026-10-17" |
| `congtrinh` | chữ | 29/29 | "CT A Huynh (PTH, TP)" |
| `projectId` | chữ | 29/29 | "59c2eb95-192b-4505-bc12-6a7775542c6d" |
| `thauphu` | chữ | 29/29 | "TPDN BÉ" |
| `giaTri` | số | 29/29 | 59670000 |
| `nd` | chữ | 29/29 | "Thi công tiếp địa, chống sét - Tính trọn gói chưa trừ ph… |
| `items` | mảng | 16/29 | [{"name": "Trệt", "donVi": "m2", "sl": 36.4, "donGia": 17… |
| `thauphuId` | chữ | 29/29 | "7b78b334-48cb-4d06-8cac-18f00562bb9d" |
| `phatSinh` | số | 12/29 | 0 |
| `sl` | số | 11/29 | 1 |
| `donGia` | số | 11/29 | 0 |

## `trash_v1` — null

## `cat_ct_years` — object, 36 khóa
Ví dụ: `"CT Nhà Tình (925 Âu Cơ, TP)"` → 2026; `"SC Chú Thỉ (24 MGX, BT)"` → 2026; `"CT Nhà Thầy Phước (Bảo Lộc)"` → 2025

## `cat_cn_roles` — object, 52 khóa
Ví dụ: `"C TÂM"` → "P"; `"CÒ"` → "P"; `"CƯỜNG"` → "T"

## `cat_items_v1` — object, 6 khóa
Ví dụ: `"loai"` → [{"id": "33873213-6491-49cb-8858-0fa416a210ba", "name": "…; `"ncc"` → [{"id": "3bf9d34a-4e74-482e-8b7a-eff0c659124d", "name": "…; `"nguoi"` → [{"id": "2afe4cd7-dee3-4c77-ac45-a9f6a03a8b98", "name": "…
