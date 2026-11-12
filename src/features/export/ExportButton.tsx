// Nút nhanh "Xuất dữ liệu" ở các màn khác (đặc tả 1.5): nhảy sang tab Xuất Dữ Liệu, chọn sẵn đúng loại dữ liệu của màn
// + bộ lọc đang áp (công trình, năm). Thay cho 9 nút CSV của app cũ.
import { useNavigate } from 'react-router-dom';
import { useAccess } from '@/app/auth';
import { useYears } from '@/app/year';
import { Button, Icon } from '@/components/ui/button';
import { canSeeExport } from '@/lib/permissions';
import type { DatasetKey } from './registry';

type Props = {
  datasets: DatasetKey[];
  projectId?: string | null;
  /** Bỏ trống = theo ô chọn năm trên thanh trên (chọn đúng 1 năm thì lọc năm đó) */
  year?: number | null;
  deleted?: boolean;
  timesheet?: 'detail' | 'grouped';
  label?: string;
};

export function exportLink({ datasets, projectId, year, deleted, timesheet }: Omit<Props, 'label'>): string {
  const q = new URLSearchParams({ ds: datasets.join(',') });
  if (projectId) q.set('project', projectId);
  if (year) q.set('year', String(year));
  if (deleted) q.set('deleted', '1');
  if (timesheet) q.set('ts', timesheet);
  return `/xuat-du-lieu?${q.toString()}`;
}

export function ExportButton({ label = 'Xuất dữ liệu', year, ...rest }: Props) {
  const navigate = useNavigate();
  const access = useAccess();
  const { years } = useYears();
  if (!canSeeExport(access.permissions)) return null;
  const y = year !== undefined ? year : Array.isArray(years) && years.length === 1 ? years[0] : null;
  return (
    <Button data-testid="quick-export" onClick={() => navigate(exportLink({ ...rest, year: y }))} title="Mở tab Xuất Dữ Liệu với dữ liệu của màn này">
      <Icon name="download" />{label}
    </Button>
  );
}
