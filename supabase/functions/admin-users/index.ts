// Edge Function admin-users — tạo tài khoản, đặt lại mật khẩu, khóa / mở khóa.
// Chỉ người có quyền "Tài khoản & quyền" = Toàn quyền (Admin) gọi được.
// Gọi: supabase.functions.invoke('admin-users', { body: { action, ... } })
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  cryptoRandom,
  generateTempPassword,
  isValidUsername,
  normalizeUsername,
  toLoginEmail,
} from '../_shared/username.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const env = (...names: string[]) => {
  for (const n of names) {
    const v = Deno.env.get(n);
    if (v) return v;
  }
  throw new Error(`Thiếu biến môi trường ${names.join(' / ')}`);
};

type Body =
  | {
      action: 'create';
      username: string;
      display_name: string;
      role_id: string;
      project_scope?: 'all' | 'assigned';
      project_ids?: string[];
      must_change_password?: boolean;
      password?: string;
    }
  | { action: 'reset_password'; user_id: string }
  | { action: 'set_locked'; user_id: string; locked: boolean };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Chỉ nhận POST' });

  try {
    const url = env('SUPABASE_URL');
    const anonKey = env('SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEY');
    const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY');
    const authHeader = req.headers.get('Authorization') ?? '';

    // 1) Kiểm tra người gọi bằng chính phiên đăng nhập của họ (RLS + has_permission)
    const asCaller = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userErr } = await asCaller.auth.getUser(authHeader.replace(/^Bearer\s+/i, ''));
    if (userErr || !userData.user) return json(401, { error: 'Chưa đăng nhập' });
    const callerId = userData.user.id;

    const { data: allowed, error: permErr } = await asCaller.rpc('has_permission', {
      module: 'accounts',
      level: 'full',
    });
    if (permErr) return json(500, { error: permErr.message });
    if (!allowed) return json(403, { error: 'Chỉ Admin được quản lý tài khoản' });

    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: callerProfile, error: cpErr } = await admin
      .from('profiles')
      .select('company_id, companies(slug)')
      .eq('id', callerId)
      .single();
    if (cpErr || !callerProfile) return json(403, { error: 'Không tìm thấy tài khoản người gọi' });
    const companyId = callerProfile.company_id as string;
    const companySlug = (callerProfile.companies as unknown as { slug: string }).slug;

    const body = (await req.json()) as Body;

    // Tài khoản đích phải cùng công ty
    const loadTarget = async (userId: string) => {
      const { data } = await admin
        .from('profiles')
        .select('id, username, company_id')
        .eq('id', userId)
        .eq('company_id', companyId)
        .maybeSingle();
      return data;
    };

    if (body.action === 'create') {
      const username = normalizeUsername(body.username ?? '');
      const displayName = (body.display_name ?? '').trim().toUpperCase();
      if (!isValidUsername(username)) {
        return json(400, { error: 'Tên đăng nhập 2–32 ký tự, chỉ chữ không dấu, số, dấu chấm, gạch' });
      }
      if (!displayName) return json(400, { error: 'Thiếu tên hiển thị' });

      const { data: role } = await admin
        .from('roles')
        .select('id, is_admin')
        .eq('id', body.role_id)
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .maybeSingle();
      if (!role) return json(400, { error: 'Vai trò không hợp lệ' });

      const { data: dup } = await admin
        .from('profiles')
        .select('id')
        .eq('company_id', companyId)
        .eq('username', username)
        .maybeSingle();
      if (dup) return json(409, { error: `Tên đăng nhập "${username}" đã có` });

      const password = body.password && body.password.length >= 8 ? body.password : generateTempPassword(cryptoRandom);
      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email: toLoginEmail(username, companySlug),
        password,
        email_confirm: true,
        user_metadata: { username, display_name: displayName },
      });
      if (cErr || !created.user) return json(400, { error: cErr?.message ?? 'Không tạo được tài khoản' });

      const scope = body.project_scope === 'assigned' ? 'assigned' : 'all';
      const { error: pErr } = await admin.from('profiles').insert({
        id: created.user.id,
        company_id: companyId,
        username,
        display_name: displayName,
        role_id: role.id,
        project_scope: scope,
        must_change_password: body.must_change_password ?? true,
        created_by: callerId,
      });
      if (pErr) {
        await admin.auth.admin.deleteUser(created.user.id);
        return json(400, { error: pErr.message });
      }
      if (scope === 'assigned' && body.project_ids?.length) {
        await admin.from('profile_projects').insert(
          body.project_ids.map((pid) => ({ profile_id: created.user.id, project_id: pid, company_id: companyId })),
        );
      }
      return json(200, { user_id: created.user.id, username, password });
    }

    if (body.action === 'reset_password') {
      const target = await loadTarget(body.user_id);
      if (!target) return json(404, { error: 'Không tìm thấy tài khoản' });
      const password = generateTempPassword(cryptoRandom);
      const { error } = await admin.auth.admin.updateUserById(target.id, { password });
      if (error) return json(400, { error: error.message });
      await admin.from('profiles').update({ must_change_password: true }).eq('id', target.id);
      return json(200, { user_id: target.id, username: target.username, password });
    }

    if (body.action === 'set_locked') {
      if (body.user_id === callerId) return json(400, { error: 'Không tự khóa được tài khoản của mình' });
      const target = await loadTarget(body.user_id);
      if (!target) return json(404, { error: 'Không tìm thấy tài khoản' });
      const { error } = await admin.auth.admin.updateUserById(target.id, {
        ban_duration: body.locked ? '876000h' : 'none',
      });
      if (error) return json(400, { error: error.message });
      await admin.from('profiles').update({ is_locked: body.locked }).eq('id', target.id);
      return json(200, { user_id: target.id, locked: body.locked });
    }

    return json(400, { error: 'Thao tác không hợp lệ' });
  } catch (e) {
    return json(500, { error: e instanceof Error ? e.message : String(e) });
  }
});
