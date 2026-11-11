// Nhãn hiển thị của công trình
export const PROJECT_STATUS_OPTIONS = [
  { value: 'planning', label: 'Chuẩn bị' },
  { value: 'active', label: 'Đang thi công' },
  { value: 'completed', label: 'Hoàn thành' },
  { value: 'closed', label: 'Đã quyết toán' },
] as const;

export const STATUS_LABEL: Record<string, string> = Object.fromEntries(PROJECT_STATUS_OPTIONS.map((o) => [o.value, o.label]));

export const STATUS_TONE: Record<string, 'good' | 'accent' | 'warn' | 'neutral'> = {
  planning: 'neutral', active: 'accent', completed: 'good', closed: 'neutral',
};
