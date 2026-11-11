// Kiểm tra dữ liệu một hóa đơn trước khi ghi vào kho (Zod).
import { z } from 'zod';

const uuid = z.string().uuid();

export const expenseLineInputSchema = z.object({
  name: z.string().trim().max(300),
  unit: z.string().trim().max(30).nullable(),
  quantity: z.number().finite().min(0),
  unitPrice: z.number().int().min(0),
  discount: z.string().trim().max(30).nullable(),
  amount: z.number().int(),
});

export const expenseInputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày không hợp lệ'),
  projectId: uuid,
  typeId: uuid,
  supplierId: uuid.nullable(),
  buyerId: uuid.nullable(),
  paid: z.boolean(),
  description: z.string().trim().max(2000),
  amount: z.number().int('Số tiền phải là số nguyên (đồng)').min(0, 'Số tiền không được âm').max(999_999_999_999, 'Số tiền quá lớn'),
  invoiceNo: z.string().trim().max(60).nullable().optional(),
  source: z.enum(['quick', 'detail', 'scan', 'import']),
  /** Có trường này (kể cả mảng rỗng) thì dòng vật tư của hóa đơn được thay bằng danh sách mới */
  lines: z.array(expenseLineInputSchema).optional(),
});

export type ExpenseInput = z.infer<typeof expenseInputSchema>;
export type ExpenseLineInput = z.infer<typeof expenseLineInputSchema>;
