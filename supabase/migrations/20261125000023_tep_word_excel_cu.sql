-- GĐ99 (25/11/2026): kho `documents` nhận thêm Excel đời cũ (.xls) và Word (.doc, .docx) — chỉ lưu và tải về. Mỗi tệp tối đa 3 MB.
update storage.buckets
set file_size_limit = 3 * 1024 * 1024,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
where id = 'documents';
