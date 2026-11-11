// Đổi mật khẩu: bắt buộc ở lần đăng nhập đầu (mật khẩu tạm), hoặc tự vào từ menu tài khoản
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { Button, Icon } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/app/auth';
import { supabase } from '@/lib/supabase';

export const newPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, 'Mật khẩu ít nhất 8 ký tự')
      .regex(/[A-Za-z]/, 'Mật khẩu cần có chữ')
      .regex(/[0-9]/, 'Mật khẩu cần có số'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: 'Hai lần nhập không giống nhau', path: ['confirm'] });

export function ChangePasswordPage({ forced }: { forced: boolean }) {
  const { access, refreshAccess, signOut } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = newPasswordSchema.safeParse({ password, confirm });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Mật khẩu chưa hợp lệ');
    setError(null);
    setBusy(true);
    try {
      const { error: upErr } = await supabase.auth.updateUser({ password });
      if (upErr) {
        throw new Error(/same/i.test(upErr.message) ? 'Mật khẩu mới phải khác mật khẩu cũ' : upErr.message);
      }
      const { error: rpcErr } = await supabase.rpc('complete_password_change');
      if (rpcErr) throw new Error(rpcErr.message);
      await refreshAccess();
      toast('Đã đổi mật khẩu');
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={forced ? 'grid min-h-dvh place-items-center px-4 py-8' : 'grid'}>
      <form
        onSubmit={submit}
        aria-label="Đổi mật khẩu"
        className="grid w-full max-w-sm gap-4 rounded-[var(--r)] border border-line bg-surface p-6 shadow-card"
      >
        <div>
          <h1 className="m-0 text-lg font-bold">{forced ? 'Đổi mật khẩu lần đầu' : 'Đổi mật khẩu'}</h1>
          <p className="mt-1 mb-0 text-[13px] text-muted">
            {forced
              ? `Chào ${access?.profile.display_name ?? ''}. Đây là lần đăng nhập đầu, anh/chị đặt mật khẩu riêng để dùng tiếp.`
              : 'Mật khẩu mới ít nhất 8 ký tự, có chữ và số.'}
          </p>
        </div>
        <Field label="Mật khẩu mới" hint="Ít nhất 8 ký tự, có chữ và số">
          <Input
            type="password"
            name="new-password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            className="h-10 text-sm"
          />
        </Field>
        <Field label="Nhập lại mật khẩu mới">
          <Input
            type="password"
            name="confirm-password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="h-10 text-sm"
          />
        </Field>
        {error ? (
          <div role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-[13px] text-bad">
            {error}
          </div>
        ) : null}
        <Button type="submit" variant="primary" size="lg" disabled={busy}>
          <Icon name="key" />
          {busy ? 'Đang lưu…' : 'Lưu mật khẩu mới'}
        </Button>
        {forced ? (
          <Button variant="ghost" onClick={() => void signOut()}>
            Đăng xuất
          </Button>
        ) : null}
      </form>
    </div>
  );
}
