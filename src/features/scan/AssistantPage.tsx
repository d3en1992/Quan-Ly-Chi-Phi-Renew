// Tab chính "Trợ lý AI" (nằm dưới Dashboard; điện thoại: nút giữa thanh dưới). 3 khổ:
// máy tính ≥1024 — khung nhập + bảng "AI làm được gì" 2 cột · máy tính bảng 640–1023 — 1 cột rộng · điện thoại — thẻ gọn.
import { Link } from 'react-router-dom';
import { pathOfSub } from '@/app/nav';
import { useLayoutMode } from '@/app/useLayoutMode';
import { Icon } from '@/components/ui/button';
import { AiBadge } from '@/components/ui/ai-badge';
import { PageHeader } from '@/components/ui/misc';
import { ScanWorkspace } from './ScanWorkspace';

const linkCls = 'inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-[13px] font-medium text-fg hover:border-accent hover:text-accent';

export function AssistantPage() {
  const mode = useLayoutMode();
  const phone = mode === 'phone';
  const manual = <Link to={pathOfSub('nhap')} className={linkCls}><Icon name="edit_note" className="text-[18px]" />Nhập tay</Link>;
  return (
    <>
      {phone ? <div className="flex flex-wrap gap-2">{manual}</div> : (
        <div className="flex flex-wrap items-start gap-3">
          <AiBadge size={44} />
          <div className="min-w-0 flex-1"><PageHeader title="Trợ lý AI" sub="Nói, chụp hoặc gửi tệp — AI điền sẵn hóa đơn, tiền ứng, thu tiền, hợp đồng, vật tư cần mua để anh kiểm tra rồi lưu" actions={manual} /></div>
        </div>
      )}
      <ScanWorkspace compact={phone} guide={!phone} />
    </>
  );
}
