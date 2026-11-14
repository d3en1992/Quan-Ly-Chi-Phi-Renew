// Danh Bạ › CỬA HÀNG: điểm bán vật tư (tên, địa chỉ, khu vực, SĐT, mặt hàng, ảnh mặt tiền), có thể nối 1 nhà cung cấp.
// Ảnh mặt tiền ở kho riêng `shop-photos` (`<company_id>/<uuid>.jpg`) — migration …000019_cua_hang.sql.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { LOOKUPS_KEY } from '@/features/expenses/api';
import { CONTACTS_KEY } from './api';

const sb = supabase as unknown as SupabaseClient;
export const SHOP_BUCKET = 'shop-photos';
export const SHOPS_KEY = ['shops'] as const;

const str = z.string().nullable();
const shopSchema = z.object({
  id: z.string(), name: z.string(), address: str, area: str, phone: str, details: str, photo_path: str, supplier_id: str,
  created_by: str, updated_at: z.string(),
});
export type Shop = z.infer<typeof shopSchema>;

/** Mặt hàng / ghi chú lưu 1 ô chữ, mỗi dòng 1 gạch đầu dòng */
export const detailLines = (details: string | null | undefined): string[] =>
  String(details ?? '').split('\n').map((l) => l.replace(/^[\s\-–•*+·]+/, '').trim()).filter(Boolean);

export function useShops() {
  return useQuery({
    queryKey: SHOPS_KEY,
    staleTime: 30_000,
    queryFn: async (): Promise<Shop[]> => {
      const { data, error } = await sb.from('shops').select(Object.keys(shopSchema.shape).join(',')).is('deleted_at', null).order('name').range(0, 4999);
      if (error) throw new Error(`Không đọc được danh sách cửa hàng: ${error.message}`);
      return z.array(shopSchema).parse(data ?? []);
    },
  });
}

/** Link xem ảnh mặt tiền (hết hạn sau 1 giờ) — tên khóa nằm trong danh sách bỏ qua Realtime (app/realtime.ts) */
export function useShopPhotoUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ['shop-photo-url', path],
    enabled: !!path,
    staleTime: 50 * 60_000,
    queryFn: async () => {
      const { data, error } = await sb.storage.from(SHOP_BUCKET).createSignedUrl(path!, 3600);
      if (error) throw new Error(error.message);
      return data.signedUrl;
    },
  });
}

export type ShopFieldsInput = { name: string; address: string; area: string; phone: string; details: string };
/** Nối nhà cung cấp: không nối · nối NCC có sẵn · tạo NCC mới cùng tên cửa hàng */
export type SupplierLink = { mode: 'none' } | { mode: 'existing'; id: string } | { mode: 'new' };

export type SaveShopInput = {
  id: string | null;
  fields: ShopFieldsInput;
  /** Ảnh mới (đã thu nhỏ) — undefined = giữ ảnh cũ */
  photo?: Blob;
  link: SupplierLink;
  companyId: string;
};

const clean = (s: string) => s.trim().replace(/[ \t]+/g, ' ');

export function useSaveShop() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, fields, photo, link, companyId }: SaveShopInput): Promise<{ id: string; supplierCreated: string | null }> => {
      const name = clean(fields.name);
      if (!name) throw new Error('Chưa có tên cửa hàng.');
      const details = fields.details.split('\n').map((l) => l.replace(/^[\s\-–•*+·]+/, '').trim()).filter(Boolean).join('\n');
      let photoPath: string | undefined;
      if (photo) {
        photoPath = `${companyId}/${crypto.randomUUID()}.jpg`;
        const { error } = await sb.storage.from(SHOP_BUCKET).upload(photoPath, photo, { contentType: 'image/jpeg', upsert: false });
        if (error) throw new Error(`Chưa lưu được ảnh cửa hàng: ${error.message}`);
      }
      try {
        // Nhà cung cấp: tạo mới (tên in hoa như danh mục; trùng tên thì nối vào NCC đó) hoặc bổ sung địa chỉ / SĐT còn trống
        let supplierId: string | null = null;
        let supplierCreated: string | null = null;
        if (link.mode === 'new') {
          const upper = name.toUpperCase();
          const { data: found, error: fe } = await sb.from('suppliers').select('id').ilike('name', upper).is('deleted_at', null).maybeSingle();
          if (fe) throw new Error(fe.message);
          if (found) supplierId = (found as { id: string }).id;
          else {
            const { data, error } = await sb.from('suppliers')
              .insert({ name: upper, address: clean(fields.address) || null, phone: clean(fields.phone) || null, note: details ? details.split('\n').join('; ').slice(0, 300) : null })
              .select('id').single();
            if (error) throw new Error(error.code === '42501' ? 'Không có quyền thêm nhà cung cấp.' : error.message);
            supplierId = (data as { id: string }).id;
            supplierCreated = upper;
          }
        } else if (link.mode === 'existing') supplierId = link.id;
        if (supplierId && !supplierCreated) {
          const { data: cur } = await sb.from('suppliers').select('address,phone').eq('id', supplierId).maybeSingle();
          const c = (cur ?? {}) as { address?: string | null; phone?: string | null };
          const patch: Record<string, string> = {};
          if (!c.address?.trim() && clean(fields.address)) patch.address = clean(fields.address);
          if (!c.phone?.trim() && clean(fields.phone)) patch.phone = clean(fields.phone);
          if (Object.keys(patch).length) await sb.from('suppliers').update(patch).eq('id', supplierId);
        }
        const row: Record<string, unknown> = {
          name, address: clean(fields.address) || null, area: clean(fields.area) || null, phone: clean(fields.phone) || null,
          details: details || null, supplier_id: supplierId,
        };
        if (photoPath) row.photo_path = photoPath;
        if (id) {
          const { error } = await sb.from('shops').update(row).eq('id', id);
          if (error) throw new Error(error.code === '42501' ? 'Bạn không có quyền sửa cửa hàng này.' : error.message);
          return { id, supplierCreated };
        }
        const { data, error } = await sb.from('shops').insert(row).select('id').single();
        if (error) throw new Error(error.code === '42501' ? 'Bạn không có quyền thêm cửa hàng.' : error.message);
        return { id: (data as { id: string }).id, supplierCreated };
      } catch (e) {
        if (photoPath) await sb.storage.from(SHOP_BUCKET).remove([photoPath]);
        throw e;
      }
    },
    onSuccess: () => Promise.all([
      qc.invalidateQueries({ queryKey: SHOPS_KEY }), qc.invalidateQueries({ queryKey: CONTACTS_KEY }), qc.invalidateQueries({ queryKey: LOOKUPS_KEY }),
    ]),
  });
}

export function useDeleteShop() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from('shops').update({ deleted_at: new Date().toISOString() }).eq('id', id);
      if (error) throw new Error(error.code === '42501' ? 'Bạn không có quyền xóa cửa hàng này.' : error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: SHOPS_KEY }),
  });
}

/** Chữ gửi Zalo cho thợ đi mua đồ: tên, địa chỉ, SĐT, mặt hàng, link bản đồ */
export function shopShareText(s: Pick<Shop, 'name' | 'address' | 'phone' | 'details'>): string {
  const lines = detailLines(s.details);
  return [
    `🏪 ${s.name}`,
    s.address ? `📍 ${s.address}` : '',
    s.phone ? `📞 ${s.phone}` : '',
    ...lines.map((l) => `- ${l}`),
    s.address ? `Bản đồ: ${mapsLink(s.address, s.name)}` : '',
  ].filter(Boolean).join('\n');
}

export const mapsLink = (address: string, name = '') =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([name, address].filter(Boolean).join(', '))}`;
