// Subtab TÀI KHOẢN: danh sách, tạo, sửa, đặt lại mật khẩu, khóa
import { useEffect, useState } from 'react';
import { Button, Icon } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm';
import { Checkbox, Field, Input, Select } from '@/components/ui/input';
import { Card, CardHeader, EmptyState, ErrorState, LoadingState, Note, Pill } from '@/components/ui/misc';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { useAccess } from '@/app/auth';
import { formatLastSeen } from '@/lib/format';
import { cryptoRandom, generateTempPassword, normalizeUsername } from '@shared/username';
import { useAccounts, useCreateAccount, useResetPassword, useRoles, useSetLocked, useUpdateAccount } from './api';
import { copyText, credentialsText } from './credentials';
import { accountStatus, createAccountSchema, suggestUsername, type AccountRow, type Role } from './schema';

const appUrl = () => window.location.origin;

function scopeText(a: Pick<AccountRow, 'project_scope' | 'project_ids'>) {
  return a.project_scope === 'all' ? 'Tất cả' : `${a.project_ids.length} công trình`;
}

export function AccountsTab() {
  const access = useAccess();
  const accounts = useAccounts();
  const roles = useRoles();
  const canEdit = access.permissions.accounts === 'full';
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<AccountRow | null>(null);
  const [resetting, setResetting] = useState<AccountRow | null>(null);
  const [locking, setLocking] = useState<AccountRow | null>(null);
  const [issued, setIssued] = useState<{ username: string; password: string; displayName: string } | null>(null);
  const toast = useToast();
  const resetPw = useResetPassword();
  const setLocked = useSetLocked();

  const roleTone = (name: string) => (name === 'Admin' ? 'accent' : name === 'Chỉ xem' ? 'neutral' : 'good');

  const doReset = async () => {
    if (!resetting) return;
    try {
      const r = await resetPw.mutateAsync(resetting.id);
      setIssued({ username: r.username, password: r.password, displayName: resetting.display_name });
      setResetting(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    }
  };
  const doLock = async () => {
    if (!locking) return;
    try {
      await setLocked.mutateAsync({ userId: locking.id, locked: !locking.is_locked });
      toast(locking.is_locked ? 'Đã mở khóa tài khoản' : 'Đã khóa tài khoản');
      setLocking(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    }
  };

  const actions = (a: AccountRow) =>
    canEdit ? (
      <div className="flex flex-wrap justify-end gap-0.5">
        <Button size="sm" variant="ghost" onClick={() => setEditing(a)}>
          <Icon name="edit" />
          Sửa
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setResetting(a)}>
          <Icon name="key" />
          Đặt lại MK
        </Button>
        {a.id === access.profile.id ? null : (
          <Button size="sm" variant={a.is_locked ? 'ghost' : 'ghost-danger'} onClick={() => setLocking(a)}>
            <Icon name={a.is_locked ? 'lock_open' : 'block'} />
            {a.is_locked ? 'Mở khóa' : 'Khóa'}
          </Button>
        )}
      </div>
    ) : null;

  let body;
  if (accounts.isLoading) body = <LoadingState />;
  else if (accounts.error) body = <ErrorState error={accounts.error} onRetry={() => void accounts.refetch()} />;
  else if (!accounts.data?.length) body = <EmptyState icon="group" title="Chưa có tài khoản nào" />;
  else
    body = (
      <>
        {/* Máy tính / máy tính bảng: bảng */}
        <div className="tbl hidden sm:block">
          <table>
            <thead>
              <tr>
                <th>Tên hiển thị</th>
                <th>Tên đăng nhập</th>
                <th>Vai trò</th>
                <th>Công trình được xem</th>
                <th>Trạng thái</th>
                <th>Đăng nhập gần nhất</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {accounts.data.map((a) => {
                const st = accountStatus(a);
                return (
                  <tr key={a.id} data-account={a.username}>
                    <td>
                      <b className="font-semibold">{a.display_name}</b>
                    </td>
                    <td className="num">{a.username}</td>
                    <td>
                      <Pill tone={roleTone(a.role_name)}>{a.role_name}</Pill>
                    </td>
                    <td>{scopeText(a)}</td>
                    <td>
                      <Pill tone={st.tone}>{st.label}</Pill>
                    </td>
                    <td className="num text-faint">{formatLastSeen(a.last_sign_in_at)}</td>
                    <td className="text-right">{actions(a)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* Điện thoại: thẻ */}
        <div className="grid gap-2 p-3 sm:hidden">
          {accounts.data.map((a) => {
            const st = accountStatus(a);
            return (
              <div key={a.id} className="grid gap-2 rounded-xl border border-line bg-surface px-3.5 py-3">
                <div className="flex items-center justify-between gap-2">
                  <b className="text-sm">{a.display_name}</b>
                  <Pill tone={roleTone(a.role_name)}>{a.role_name}</Pill>
                </div>
                <div className="flex items-center justify-between gap-2 text-xs text-muted">
                  <span>
                    {a.username} · {scopeText(a)}
                  </span>
                  <Pill tone={st.tone}>{st.label}</Pill>
                </div>
                {actions(a)}
              </div>
            );
          })}
        </div>
      </>
    );

  return (
    <>
      <Card>
        <CardHeader
          title="Tài khoản"
          sub="đăng nhập bằng tên đăng nhập + mật khẩu, không cần Gmail"
          actions={
            canEdit ? (
              <Button variant="primary" onClick={() => setCreateOpen(true)}>
                <Icon name="person_add" />
                Tạo tài khoản
              </Button>
            ) : null
          }
        />
        {body}
      </Card>
      <Note>
        Tạo xong, app cho nút <b>Copy thông tin đăng nhập</b> (link app + tên đăng nhập + mật khẩu tạm) để gửi qua Zalo.
        Lần đầu đăng nhập, người đó phải tự đổi mật khẩu.
      </Note>

      <CreateAccountSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        roles={roles.data ?? []}
        onCreated={(r) => {
          setCreateOpen(false);
          setIssued(r);
        }}
      />
      {editing ? (
        <EditAccountSheet account={editing} roles={roles.data ?? []} isSelf={editing.id === access.profile.id} onClose={() => setEditing(null)} />
      ) : null}
      <ConfirmDialog
        open={!!resetting}
        onOpenChange={(v) => !v && setResetting(null)}
        title="Đặt lại mật khẩu?"
        message={
          <>
            App sẽ sinh mật khẩu tạm mới cho <b>{resetting?.display_name}</b>. Mật khẩu cũ hết dùng được, lần đăng nhập tới phải đổi mật khẩu.
          </>
        }
        confirmLabel="Đặt lại"
        busy={resetPw.isPending}
        onConfirm={doReset}
      />
      <ConfirmDialog
        open={!!locking}
        onOpenChange={(v) => !v && setLocking(null)}
        title={locking?.is_locked ? 'Mở khóa tài khoản?' : 'Khóa tài khoản?'}
        message={
          locking?.is_locked ? (
            <>
              <b>{locking?.display_name}</b> sẽ đăng nhập lại được.
            </>
          ) : (
            <>
              <b>{locking?.display_name}</b> sẽ không đăng nhập được nữa. Dữ liệu họ đã nhập vẫn giữ nguyên.
            </>
          )
        }
        confirmLabel={locking?.is_locked ? 'Mở khóa' : 'Khóa'}
        danger={!locking?.is_locked}
        busy={setLocked.isPending}
        onConfirm={doLock}
      />
      <IssuedSheet issued={issued} onClose={() => setIssued(null)} />
    </>
  );
}

/** Hiện mật khẩu tạm vừa tạo / đặt lại + nút copy gửi Zalo */
function IssuedSheet({
  issued,
  onClose,
}: {
  issued: { username: string; password: string; displayName: string } | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const text = issued ? credentialsText({ appUrl: appUrl(), ...issued }) : '';
  return (
    <Sheet
      open={!!issued}
      onOpenChange={(v) => !v && onClose()}
      title="Thông tin đăng nhập"
      footer={
        <>
          <div className="flex-1" />
          <Button onClick={onClose}>Đóng</Button>
          <Button
            variant="primary"
            onClick={async () => {
              const ok = await copyText(text);
              toast(ok ? 'Đã copy, dán vào Zalo để gửi' : 'Không copy được, chép tay giúp em', ok ? 'ok' : 'error');
            }}
          >
            <Icon name="content_copy" />
            Copy thông tin đăng nhập
          </Button>
        </>
      }
    >
      <Note icon="check_circle">Đã xong. Mật khẩu tạm chỉ hiện lần này, copy gửi qua Zalo ngay.</Note>
      <pre data-testid="credentials" className="m-0 rounded-lg bg-surface-2 p-3 font-[inherit] text-[13px] leading-relaxed whitespace-pre-wrap">
        {text}
      </pre>
    </Sheet>
  );
}

function CreateAccountSheet({
  open,
  onOpenChange,
  roles,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  roles: Role[];
  onCreated: (r: { username: string; password: string; displayName: string }) => void;
}) {
  const create = useCreateAccount();
  const toast = useToast();
  const assignable = roles.filter((r) => !r.is_admin);
  const empty = () => ({
    display_name: '',
    username: '',
    usernameTouched: false,
    role_id: assignable.find((r) => r.name === 'Kế toán')?.id ?? assignable[0]?.id ?? '',
    password: generateTempPassword(cryptoRandom),
    project_scope: 'all' as 'all' | 'assigned',
    must_change_password: true,
  });
  const [f, setF] = useState(empty);
  // Mỗi lần mở: làm mới form; danh sách vai trò tải xong sau thì chọn sẵn vai trò mặc định
  const defaultRoleId = empty().role_id;
  useEffect(() => {
    if (open) {
      setF(empty());
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    if (open && !f.role_id && defaultRoleId) setF((x) => ({ ...x, role_id: defaultRoleId }));
  }, [open, f.role_id, defaultRoleId]);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const parsed = createAccountSchema.safeParse(f);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Thông tin chưa hợp lệ');
    setError(null);
    try {
      const r = await create.mutateAsync(parsed.data);
      const text = credentialsText({ appUrl: appUrl(), username: r.username, password: r.password, displayName: parsed.data.display_name.toUpperCase() });
      const copied = await copyText(text);
      toast(copied ? 'Đã tạo tài khoản và copy thông tin' : 'Đã tạo tài khoản');
      onCreated({ username: r.username, password: r.password, displayName: parsed.data.display_name.toUpperCase() });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const role = roles.find((r) => r.id === f.role_id);
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Tạo tài khoản"
      footer={
        <>
          <div className="flex-1" />
          <Button onClick={() => onOpenChange(false)}>Hủy</Button>
          <Button variant="primary" disabled={create.isPending} onClick={submit}>
            <Icon name="content_copy" />
            Tạo + copy thông tin
          </Button>
        </>
      }
    >
      <Field label="Tên hiển thị">
        <Input
          name="display_name"
          value={f.display_name}
          autoFocus
          onChange={(e) => {
            const display_name = e.target.value;
            setF((x) => ({ ...x, display_name, username: x.usernameTouched ? x.username : suggestUsername(display_name) }));
          }}
        />
      </Field>
      <Field label="Tên đăng nhập" hint="Chữ không dấu, số, dấu chấm. Ví dụ: thao, gs.ahuynh">
        <Input
          name="username"
          value={f.username}
          autoCapitalize="none"
          onChange={(e) => setF((x) => ({ ...x, username: normalizeUsername(e.target.value), usernameTouched: true }))}
        />
      </Field>
      <Field label="Vai trò">
        <Select
          name="role_id"
          value={f.role_id}
          onChange={(e) => {
            const r = roles.find((x) => x.id === e.target.value);
            setF((x) => ({ ...x, role_id: e.target.value, project_scope: r?.default_project_scope ?? x.project_scope }));
          }}
        >
          {assignable.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
      </Field>
      {role?.description ? <div className="-mt-1.5 text-xs text-faint">{role.description}</div> : null}
      <Field label="Mật khẩu tạm (tự sinh)">
        <div className="flex gap-2">
          <Input name="password" className="num" value={f.password} onChange={(e) => setF((x) => ({ ...x, password: e.target.value }))} />
          <Button size="icon" aria-label="Sinh mật khẩu khác" onClick={() => setF((x) => ({ ...x, password: generateTempPassword(cryptoRandom) }))}>
            <Icon name="refresh" />
          </Button>
        </div>
      </Field>
      <Field label="Công trình được xem" hint={f.project_scope === 'assigned' ? 'Chọn công trình cụ thể sau khi có dữ liệu công trình (GĐ2–GĐ4).' : undefined}>
        <Select name="project_scope" value={f.project_scope} onChange={(e) => setF((x) => ({ ...x, project_scope: e.target.value as 'all' | 'assigned' }))}>
          <option value="all">Tất cả công trình</option>
          <option value="assigned">Chỉ công trình được giao</option>
        </Select>
      </Field>
      <Checkbox
        checked={f.must_change_password}
        onChange={(v) => setF((x) => ({ ...x, must_change_password: v }))}
        label="Bắt đổi mật khẩu ở lần đăng nhập đầu"
      />
      <div className="rounded-lg bg-accent-soft px-3 py-2.5 text-[12.5px]">
        <b>Thông tin gửi qua Zalo</b>
        <div className="num mt-1.5 leading-relaxed">
          App: {appUrl()}
          <br />
          Tên đăng nhập: {f.username || '—'}
          <br />
          Mật khẩu tạm: {f.password}
        </div>
      </div>
      {error ? (
        <div role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-[13px] text-bad">
          {error}
        </div>
      ) : null}
    </Sheet>
  );
}

function EditAccountSheet({ account, roles, isSelf, onClose }: { account: AccountRow; roles: Role[]; isSelf: boolean; onClose: () => void }) {
  const update = useUpdateAccount();
  const toast = useToast();
  const [f, setF] = useState({ display_name: account.display_name, role_id: account.role_id, project_scope: account.project_scope });
  const currentRole = roles.find((r) => r.id === account.role_id);
  const roleOptions = roles.filter((r) => !r.is_admin || r.id === account.role_id);
  const save = async () => {
    if (!f.display_name.trim()) return toast('Nhập tên hiển thị', 'error');
    try {
      await update.mutateAsync({ id: account.id, ...f });
      toast('Đã lưu tài khoản');
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    }
  };
  return (
    <Sheet
      open
      onOpenChange={(v) => !v && onClose()}
      title="Sửa tài khoản"
      footer={
        <>
          <div className="flex-1" />
          <Button onClick={onClose}>Hủy</Button>
          <Button variant="primary" disabled={update.isPending} onClick={save}>
            <Icon name="save" />
            Lưu
          </Button>
        </>
      }
    >
      <Field label="Tên hiển thị">
        <Input value={f.display_name} onChange={(e) => setF((x) => ({ ...x, display_name: e.target.value }))} />
      </Field>
      <Field label="Tên đăng nhập" hint="Không đổi được">
        <Input value={account.username} disabled />
      </Field>
      <Field label="Vai trò" hint={isSelf ? 'Không tự đổi vai trò của mình được' : undefined}>
        <Select value={f.role_id} disabled={isSelf || currentRole?.is_admin} onChange={(e) => setF((x) => ({ ...x, role_id: e.target.value }))}>
          {roleOptions.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Công trình được xem">
        <Select value={f.project_scope} onChange={(e) => setF((x) => ({ ...x, project_scope: e.target.value as 'all' | 'assigned' }))}>
          <option value="all">Tất cả công trình</option>
          <option value="assigned">Chỉ công trình được giao</option>
        </Select>
      </Field>
      {f.project_scope === 'assigned' ? (
        <Note>Danh sách công trình để giao sẽ có khi chuyển dữ liệu công trình sang (GĐ2–GĐ4).</Note>
      ) : null}
    </Sheet>
  );
}
