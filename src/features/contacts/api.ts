// Danh Bạ: Khách hàng / Công nhân / Nhân viên / Nhà cung cấp / Thầu phụ.
// SĐT, CCCD, tài khoản nhận lương nằm ở bảng riêng `contact_private`: người KHÔNG có quyền "Xem SĐT, số CCCD"
// chỉ nhận bản đã che từ hàm list_contact_private_masked() và không đọc / ghi được bảng đó (RLS).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { REPORT_DATA_KEY } from '@/features/reports/api';
import { CUSTOMERS_KEY } from '@/features/projects/api';

// Các bảng này chọn cột theo tên động nên dùng client không kiểu; dữ liệu trả về được Zod kiểm tra ngay bên dưới.
const sb = supabase as unknown as SupabaseClient;

export type ContactKind = 'customer' | 'worker' | 'employee' | 'supplier' | 'subcontractor';
export const TABLE_OF: Record<ContactKind, string> = { customer: 'customers', worker: 'workers', employee: 'employees', supplier: 'suppliers', subcontractor: 'subcontractors' };
export const PRIVATE_FK: Record<Exclude<ContactKind, 'supplier'>, string> = { customer: 'customer_id', worker: 'worker_id', employee: 'employee_id', subcontractor: 'subcontractor_id' };

const str = z.string().nullable();
const customerSchema = z.object({ id: z.string(), name: z.string(), full_name: str, address: str, email: str, tax_code: str, note: str });
const workerSchema = z.object({ id: z.string(), name: z.string(), role: str, full_name: str, note: str, archived: z.boolean() });
const employeeSchema = z.object({ id: z.string(), full_name: z.string(), title: str, profile_id: str, started_on: str, note: str, archived: z.boolean() });
const supplierSchema = z.object({ id: z.string(), name: z.string(), address: str, phone: str, buys_on_credit: z.boolean(), note: str, archived: z.boolean() });
const subcontractorSchema = z.object({ id: z.string(), name: z.string(), field: str, contact_person: str, note: str, archived: z.boolean() });
const maskedSchema = z.object({
  customer_id: str, worker_id: str, employee_id: str, subcontractor_id: str, phone: str, id_number: str, has_bank_account: z.boolean(),
});
const privateSchema = z.object({
  customer_id: str, worker_id: str, employee_id: str, subcontractor_id: str, phone: str, id_number: str, date_of_birth: str,
  hometown: str, permanent_address: str, bank_account: str, bank_name: str, bank_holder: str, id_issued_on: str, id_issued_place: str,
});

export type Customer = z.infer<typeof customerSchema>;
export type Worker = z.infer<typeof workerSchema>;
export type Employee = z.infer<typeof employeeSchema>;
export type Supplier = z.infer<typeof supplierSchema>;
export type Subcontractor = z.infer<typeof subcontractorSchema>;
export type PrivateFields = z.infer<typeof privateSchema>;
export type Masked = z.infer<typeof maskedSchema>;

export type ContactsData = {
  customers: Customer[]; workers: Worker[]; employees: Employee[]; suppliers: Supplier[]; subcontractors: Subcontractor[];
  /** SĐT / CCCD đã che (hoặc đủ nếu có quyền) theo mã người */
  masked: Map<string, Masked>;
  /** Chi tiết riêng tư (chỉ khi có quyền xem SĐT, CCCD) */
  priv: Map<string, PrivateFields>;
};

export const CONTACTS_KEY = ['contacts'] as const;
const cols = (s: z.ZodObject<z.ZodRawShape>) => Object.keys(s.shape).join(',');

async function list<S extends z.ZodObject<z.ZodRawShape>>(table: string, schema: S, order: string): Promise<z.infer<S>[]> {
  const { data, error } = await sb.from(table).select(cols(schema)).is('deleted_at', null).order(order).range(0, 4999);
  if (error) throw new Error(`Không đọc được ${table}: ${error.message}`);
  return z.array(schema).parse(data ?? []);
}

/** Mã để tra SĐT / CCCD: id của người (mỗi dòng contact_private chỉ gắn với đúng 1 người) */
const ownerOf = (r: { customer_id: string | null; worker_id: string | null; employee_id: string | null; subcontractor_id: string | null }) =>
  r.customer_id ?? r.worker_id ?? r.employee_id ?? r.subcontractor_id ?? '';

export function useContacts(canSeeIds: boolean) {
  return useQuery({
    queryKey: [...CONTACTS_KEY, canSeeIds],
    staleTime: 30_000,
    queryFn: async (): Promise<ContactsData> => {
      const [customers, workers, employees, suppliers, subcontractors] = await Promise.all([
        list('customers', customerSchema, 'name'), list('workers', workerSchema, 'name'), list('employees', employeeSchema, 'full_name'),
        list('suppliers', supplierSchema, 'name'), list('subcontractors', subcontractorSchema, 'name'),
      ]);
      const { data: m, error: me } = await sb.rpc('list_contact_private_masked');
      if (me) throw new Error(`Không đọc được SĐT / CCCD: ${me.message}`);
      const masked = new Map(z.array(maskedSchema).parse(m ?? []).map((r) => [ownerOf(r), r]));
      const priv = new Map<string, PrivateFields>();
      if (canSeeIds) {
        const { data, error } = await sb.from('contact_private').select(cols(privateSchema)).is('deleted_at', null).range(0, 4999);
        if (error) throw new Error(`Không đọc được thông tin riêng: ${error.message}`);
        for (const r of z.array(privateSchema).parse(data ?? [])) priv.set(ownerOf(r), r);
      }
      return { customers, workers, employees, suppliers, subcontractors, masked, priv };
    },
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => Promise.all([
    qc.invalidateQueries({ queryKey: CONTACTS_KEY }), qc.invalidateQueries({ queryKey: CUSTOMERS_KEY }), qc.invalidateQueries({ queryKey: REPORT_DATA_KEY }),
  ]);
}

function friendly(e: { message: string; code?: string }): Error {
  if (e.code === '23505') return new Error('Đã có người trùng tên này.');
  if (e.code === '42501') return new Error('Bạn không có quyền thực hiện thao tác này.');
  return new Error(e.message);
}

export type SaveInput = {
  kind: ContactKind;
  id: string | null;
  /** Cột của bảng chính (name, address…) */
  fields: Record<string, unknown>;
  /** Cột của contact_private; null = không đụng (người không có quyền xem CCCD) */
  priv: Partial<PrivateFields> | null;
};

export function useSaveContact() {
  const done = useInvalidate();
  return useMutation({
    mutationFn: async ({ kind, id, fields, priv }: SaveInput) => {
      const table = TABLE_OF[kind];
      let rowId = id;
      if (id) {
        const { error } = await sb.from(table).update(fields).eq('id', id);
        if (error) throw friendly(error);
      } else {
        const { data, error } = await sb.from(table).insert(fields).select('id').single();
        if (error) throw friendly(error);
        rowId = (data as { id: string }).id;
      }
      if (priv && kind !== 'supplier' && rowId) {
        const fk = PRIVATE_FK[kind];
        const clean = Object.fromEntries(Object.entries(priv).map(([k, v]) => [k, typeof v === 'string' && v.trim() === '' ? null : v]));
        const { data: existing, error: ee } = await sb.from('contact_private').select('id').eq(fk, rowId).maybeSingle();
        if (ee) throw friendly(ee);
        if (existing) {
          const { error } = await sb.from('contact_private').update(clean).eq('id', (existing as { id: string }).id);
          if (error) throw friendly(error);
        } else if (Object.values(clean).some((v) => v)) {
          const { error } = await sb.from('contact_private').insert({ ...clean, [fk]: rowId } as never);
          if (error) throw friendly(error);
        }
      }
      return rowId!;
    },
    onSuccess: done,
  });
}

export function useDeleteContact() {
  const done = useInvalidate();
  return useMutation({
    mutationFn: async ({ kind, id }: { kind: ContactKind; id: string }) => {
      if (kind === 'customer') {
        const { count, error } = await sb.from('projects').select('id', { count: 'exact', head: true }).eq('customer_id', id).is('deleted_at', null);
        if (error) throw friendly(error);
        if ((count ?? 0) > 0) throw new Error('Khách hàng còn công trình. Chuyển hoặc xóa công trình trước.');
      }
      const { error } = await sb.from(TABLE_OF[kind]).update({ deleted_at: new Date().toISOString() }).eq('id', id);
      if (error) throw friendly(error);
    },
    onSuccess: done,
  });
}

/** Bật / tắt "Mua nợ" của nhà cung cấp */
export function useToggleCredit() {
  const done = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => {
      const { error } = await sb.from('suppliers').update({ buys_on_credit: value }).eq('id', id);
      if (error) throw friendly(error);
    },
    onSuccess: done,
  });
}
