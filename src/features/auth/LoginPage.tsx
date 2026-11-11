// Màn đăng nhập: tên đăng nhập + mật khẩu (không dùng Gmail)
import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { Button, Icon } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { useAuth } from '@/app/auth';
import { supabaseConfigError } from '@/lib/supabase';

export function LoginPage() {
  const { session, signIn } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (session) return <Navigate to="/" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!username.trim() || !password) return setError('Nhập tên đăng nhập và mật khẩu');
    setBusy(true);
    try {
      await signIn(username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-dvh place-items-center px-4 py-8">
      <form
        onSubmit={submit}
        className="grid w-full max-w-sm gap-4 rounded-[var(--r)] border border-line bg-surface p-6 shadow-card"
        aria-label="Đăng nhập"
      >
        <div className="flex items-center gap-2.5">
          <div className="grid size-10 place-items-center rounded-lg bg-accent text-accent-fg">
            <Icon name="foundation" className="text-[24px]" />
          </div>
          <div>
            <b className="block text-base leading-tight">Nguyễn Hữu</b>
            <small className="text-xs text-faint">Quản lý chi phí công trình</small>
          </div>
        </div>
        <h1 className="m-0 text-lg font-bold">Đăng nhập</h1>
        {supabaseConfigError ? (
          <div role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-[13px] text-bad">
            {supabaseConfigError}
          </div>
        ) : null}
        <Field label="Tên đăng nhập">
          <Input
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            className="h-10 text-sm"
          />
        </Field>
        <Field label="Mật khẩu">
          <div className="relative">
            <Input
              name="password"
              type={show ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-10 pr-10 text-sm"
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              className="absolute top-1/2 right-2 -translate-y-1/2 text-faint"
            >
              <Icon name={show ? 'visibility_off' : 'visibility'} className="text-[19px]" />
            </button>
          </div>
        </Field>
        {error ? (
          <div role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-[13px] text-bad">
            {error}
          </div>
        ) : null}
        <Button type="submit" variant="primary" size="lg" disabled={busy}>
          {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
        </Button>
        <p className="m-0 text-center text-xs text-faint">Quên mật khẩu? Nhờ Admin đặt lại.</p>
      </form>
    </div>
  );
}
