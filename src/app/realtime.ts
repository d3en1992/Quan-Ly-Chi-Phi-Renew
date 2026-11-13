// Tự cập nhật giữa các máy: máy A lưu (hóa đơn, chấm công, phiếu chi…) → kho báo qua Supabase Realtime →
// máy B đang mở app tự tải lại dữ liệu sau ~1–2 giây, không cần F5. Bảng nào được báo: migration …000016_realtime.sql.
// Realtime vẫn kiểm tra RLS (không được xem thì không nhận tin). Nhiều thay đổi liền nhau (lưu cả tuần chấm công) gom lại
// thành MỘT lần tải lại. Chỉ màn đang mở tải lại ngay; màn khác đánh dấu cũ, mở tới thì tải.
// Form đang gõ dở không bị xóa: form chỉ nạp dữ liệu khi mở (ProjectFormSheet, EditExpenseSheet); sổ chấm công giữ phần
// đang sửa và báo "người khác vừa lưu" (WeekSheet).
import { useEffect } from 'react';
import { useQueryClient, type Query } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { ACCESS_QUERY_KEY, useAuth } from './auth';

/** Chờ thêm chừng này sau thay đổi cuối cùng rồi mới tải lại (gom các thay đổi của một lần lưu) */
export const REALTIME_DEBOUNCE_MS = 700;

/** Không tải lại theo Realtime: quyền tài khoản (đã tự kiểm tra mỗi phút), link ảnh hóa đơn (có hạn dùng riêng) */
const SKIP = new Set<string>([ACCESS_QUERY_KEY[0], 'receipt-url']);
export const shouldRefresh = (q: Pick<Query, 'queryKey'>) => !SKIP.has(String(q.queryKey[0]));

export function useRealtimeRefresh() {
  const qc = useQueryClient();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  useEffect(() => {
    if (!userId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let connectedOnce = false;
    const refresh = () => void qc.invalidateQueries({ predicate: shouldRefresh });
    const channel = supabase
      .channel(`thay-doi-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public' }, () => {
        clearTimeout(timer);
        timer = setTimeout(refresh, REALTIME_DEBOUNCE_MS);
      })
      .subscribe((status) => {
        // Mất kết nối rồi nối lại: có thể đã lỡ tin trong lúc mất → tải lại một lần cho chắc (lần nối đầu thì không cần)
        if (status !== 'SUBSCRIBED') return;
        if (connectedOnce) refresh();
        connectedOnce = true;
      });
    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [qc, userId]);
}
