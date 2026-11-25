// Cảnh báo trùng ở màn Trợ lý AI (chỉ cảnh báo — không chặn lưu).
import { Icon } from '@/components/ui/button';
import { formatDate, formatMoney } from '@/lib/format';
import { likelyDuplicates, type DupRecord, type Fingerprint } from './duplicates';
import { useImageWarnings } from './fingerprint';

const BOX = 'flex gap-2 rounded-lg border border-warn/50 bg-warn-soft p-3 text-[13px]';

/** Đúng ảnh / tệp này (hoặc ảnh rất giống) đã được nhập */
export function ImageDuplicateNotice({ fp }: { fp: Fingerprint | null }) {
  const q = useImageWarnings(fp);
  if (!fp || !q.data?.length) return null;
  return (
    <div className={BOX} role="alert" data-testid="image-dup">
      <Icon name="content_copy" className="text-warn" />
      <div className="grid min-w-0 gap-1">
        <b>{q.data[0]!.exact ? 'Ảnh / tệp này đã được nhập rồi' : 'Ảnh này rất giống ảnh đã nhập'} — coi chừng trùng:</b>
        {q.data.map((w) => <span key={w.key} className="break-words">• {w.label}{w.exact ? '' : ' (ảnh gần giống)'}</span>)}
      </div>
    </div>
  );
}

/** Số liệu đang điền giống ≥ 90% phiếu đã lưu (kể cả nhập tay) */
export function DataDuplicateNotice<T extends DupRecord>({ incoming, saved, what, describe }: {
  incoming: DupRecord; saved: readonly T[]; what: string; describe: (r: T) => string;
}) {
  const hits = likelyDuplicates(incoming, saved);
  if (!hits.length) return null;
  return (
    <div className={BOX} role="alert" data-testid="data-dup">
      <Icon name="warning" className="text-warn" />
      <div className="grid min-w-0 gap-1">
        <b>{what} này có thể bị trùng số liệu — anh xem lại trước khi lưu:</b>
        {hits.map((h, i) => (
          <span key={h.record.id ?? i} className="break-words">
            • Giống {Math.round(h.similarity * 100)}%: {[formatDate(h.record.date), `${formatMoney(h.record.amount)} đ`, describe(h.record), h.record.text].filter(Boolean).join(' · ')}
          </span>
        ))}
      </div>
    </div>
  );
}
