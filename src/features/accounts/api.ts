// Đọc / ghi tài khoản, vai trò, bảng quyền. Quyền được kiểm tra lại trong kho (RLS + has_permission).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { ACCESS_QUERY_KEY } from '@/app/auth';
import type { Level } from '@/lib/permissions';
import {
  accountRowSchema,
  appModuleSchema,
  roleSchema,
  rolePermissionSchema,
  type CreateAccountInput,
  type Role,
} from './schema';

const KEYS = {
  accounts: ['accounts'] as const,
  roles: ['roles'] as const,
  perms: ['role-permissions'] as const,
  modules: ['app-modules'] as const,
};

function fail(error: { message: string } | null): asserts error is null {
  if (error) throw new Error(error.message);
}

/** Lỗi từ Edge Function: lấy câu tiếng Việt trong body */
async function invokeAdmin<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('admin-users', { body });
  if (error) {
    let msg = error.message;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const j = (await ctx.json()) as { error?: string };
        if (j.error) msg = j.error;
      } catch {
        /* bỏ qua */
      }
    }
    throw new Error(msg);
  }
  return data as T;
}

export function useAccounts() {
  return useQuery({
    queryKey: KEYS.accounts,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_list_accounts');
      fail(error);
      return z.array(accountRowSchema).parse(data ?? []);
    },
  });
}

export function useRoles() {
  return useQuery({
    queryKey: KEYS.roles,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('roles')
        .select('id,name,description,is_admin,sort_order,see_contact_ids,edit_others,purge_trash,default_project_scope')
        .is('deleted_at', null)
        .order('sort_order')
        .order('created_at');
      fail(error);
      return z.array(roleSchema).parse(data ?? []);
    },
  });
}

export function useRolePermissions() {
  return useQuery({
    queryKey: KEYS.perms,
    queryFn: async () => {
      const { data, error } = await supabase.from('role_permissions').select('role_id,module,level');
      fail(error);
      return z.array(rolePermissionSchema).parse(data ?? []);
    },
  });
}

export function useAppModules() {
  return useQuery({
    queryKey: KEYS.modules,
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase.from('app_modules').select('key,label,sort_order').order('sort_order');
      fail(error);
      return z.array(appModuleSchema).parse(data ?? []);
    },
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return (...keys: (readonly string[])[]) =>
    Promise.all([...keys, ACCESS_QUERY_KEY].map((k) => qc.invalidateQueries({ queryKey: k })));
}

export function useCreateAccount() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: CreateAccountInput & { username: string }) =>
      invokeAdmin<{ user_id: string; username: string; password: string }>({ action: 'create', ...input }),
    onSuccess: () => invalidate(KEYS.accounts),
  });
}

export function useResetPassword() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (userId: string) =>
      invokeAdmin<{ user_id: string; username: string; password: string }>({ action: 'reset_password', user_id: userId }),
    onSuccess: () => invalidate(KEYS.accounts),
  });
}

export function useSetLocked() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (v: { userId: string; locked: boolean }) =>
      invokeAdmin<{ user_id: string; locked: boolean }>({ action: 'set_locked', user_id: v.userId, locked: v.locked }),
    onSuccess: () => invalidate(KEYS.accounts),
  });
}

export function useUpdateAccount() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (v: { id: string; display_name: string; role_id: string; project_scope: 'all' | 'assigned' }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ display_name: v.display_name.trim().toUpperCase(), role_id: v.role_id, project_scope: v.project_scope })
        .eq('id', v.id);
      fail(error);
    },
    onSuccess: () => invalidate(KEYS.accounts),
  });
}

/** Bấm ô quyền: lưu mức mới cho (vai trò × mục) */
export function useSetPermission() {
  const qc = useQueryClient();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (v: { roleId: string; module: string; level: Level; companyId: string }) => {
      const { error } = await supabase
        .from('role_permissions')
        .upsert({ role_id: v.roleId, module: v.module, level: v.level, company_id: v.companyId }, { onConflict: 'role_id,module' });
      fail(error);
    },
    // Đổi ngay trên màn, lỗi thì trả lại
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: KEYS.perms });
      const prev = qc.getQueryData<{ role_id: string; module: string; level: Level }[]>(KEYS.perms);
      if (prev) {
        const others = prev.filter((p) => !(p.role_id === v.roleId && p.module === v.module));
        qc.setQueryData(KEYS.perms, [...others, { role_id: v.roleId, module: v.module, level: v.level }]);
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(KEYS.perms, ctx.prev);
    },
    onSettled: () => invalidate(KEYS.perms),
  });
}

export function useUpdateRole() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (v: { id: string } & Partial<Pick<Role, 'name' | 'see_contact_ids' | 'edit_others' | 'purge_trash' | 'default_project_scope'>>) => {
      const { id, ...patch } = v;
      const { error } = await supabase.from('roles').update(patch).eq('id', id);
      fail(error);
    },
    onSuccess: () => invalidate(KEYS.roles, KEYS.accounts),
  });
}

/** Tạo vai trò mới (mọi mục = Ẩn) hoặc nhân bản từ vai trò có sẵn */
export function useCreateRole() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (v: { name: string; companyId: string; copyFrom?: Role; copyPerms?: { module: string; level: Level }[] }) => {
      const src = v.copyFrom;
      const { data, error } = await supabase
        .from('roles')
        .insert({
          company_id: v.companyId,
          name: v.name.trim(),
          description: src ? `Nhân bản từ ${src.name}` : null,
          sort_order: (src?.sort_order ?? 90) + 5,
          see_contact_ids: src && !src.is_admin ? src.see_contact_ids : false,
          edit_others: src && !src.is_admin ? src.edit_others : false,
          purge_trash: src && !src.is_admin ? src.purge_trash : false,
          default_project_scope: src?.default_project_scope ?? 'all',
        })
        .select('id')
        .single();
      fail(error);
      if (v.copyPerms?.length) {
        const { error: pErr } = await supabase.from('role_permissions').insert(
          v.copyPerms.map((p) => ({ role_id: data.id, module: p.module, level: p.level, company_id: v.companyId })),
        );
        fail(pErr);
      }
      return data.id as string;
    },
    onSuccess: () => invalidate(KEYS.roles, KEYS.perms),
  });
}

/** Xóa mềm vai trò (chỉ khi không ai đang dùng) */
export function useDeleteRole() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (roleId: string) => {
      const { count, error: cErr } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role_id', roleId)
        .is('deleted_at', null);
      fail(cErr);
      if ((count ?? 0) > 0) throw new Error('Vai trò đang có người dùng, đổi vai trò cho họ trước');
      const { error } = await supabase.from('roles').update({ deleted_at: new Date().toISOString() }).eq('id', roleId);
      fail(error);
    },
    onSuccess: () => invalidate(KEYS.roles, KEYS.perms),
  });
}
