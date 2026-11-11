// Subtab VAI TRÒ & QUYỀN: bấm ô để đổi Ẩn → Xem → Nhập → Toàn quyền; quyền đặc biệt; phạm vi công trình;
// tạo / nhân bản / đổi tên / xóa vai trò. Cột Admin luôn Toàn quyền, không sửa được.
import { useState } from 'react';
import { Button, Icon } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm';
import { DropdownContent, DropdownItem, DropdownMenu, DropdownTrigger } from '@/components/ui/dropdown';
import { Field, Input, Select } from '@/components/ui/input';
import { Card, CardHeader, ErrorState, LoadingState, Note, Pill } from '@/components/ui/misc';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { useAccess } from '@/app/auth';
import { LEVEL_LABEL, nextLevel, SPECIAL_LABEL, SPECIALS, type Level, type SpecialKey } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import {
  useAccounts,
  useAppModules,
  useCreateRole,
  useDeleteRole,
  useRolePermissions,
  useRoles,
  useSetPermission,
  useUpdateRole,
} from './api';
import type { Role } from './schema';

const levelClass: Record<Level, string> = {
  none: 'border-line bg-surface text-faint',
  view: 'border-transparent bg-surface-2 text-muted',
  add: 'border-transparent bg-accent-soft text-accent',
  full: 'border-transparent bg-good-soft text-good',
};

export function LevelBadge({ level }: { level: Level }) {
  return (
    <span className={cn('inline-flex rounded-md border px-2 py-[3px] text-[11.5px] font-semibold whitespace-nowrap', levelClass[level])}>
      {LEVEL_LABEL[level]}
    </span>
  );
}

export function RolesTab() {
  const access = useAccess();
  const canEdit = access.permissions.accounts === 'full';
  const roles = useRoles();
  const perms = useRolePermissions();
  const modules = useAppModules();
  const accounts = useAccounts();
  const setPerm = useSetPermission();
  const updateRole = useUpdateRole();
  const deleteRole = useDeleteRole();
  const toast = useToast();
  const [roleSheet, setRoleSheet] = useState<null | { mode: 'new' | 'clone' | 'rename'; role?: Role }>(null);
  const [deleting, setDeleting] = useState<Role | null>(null);

  if (roles.isLoading || perms.isLoading || modules.isLoading) return <LoadingState />;
  const err = roles.error ?? perms.error ?? modules.error;
  if (err)
    return (
      <ErrorState
        error={err}
        onRetry={() => {
          void roles.refetch();
          void perms.refetch();
          void modules.refetch();
        }}
      />
    );

  const roleList = roles.data ?? [];
  const levelOf = (roleId: string, module: string): Level =>
    perms.data?.find((p) => p.role_id === roleId && p.module === module)?.level ?? 'none';
  const peopleOf = (roleId: string) => (accounts.data ?? []).filter((a) => a.role_id === roleId).map((a) => a.display_name);

  const clickCell = (role: Role, module: string) => {
    if (!canEdit || role.is_admin) return;
    const level = nextLevel(levelOf(role.id, module));
    setPerm.mutate(
      { roleId: role.id, module, level, companyId: access.company.id },
      { onError: (e) => toast(e.message, 'error') },
    );
  };
  const toggleSpecial = (role: Role, key: SpecialKey) => {
    if (!canEdit || role.is_admin) return;
    updateRole.mutate({ id: role.id, [key]: !role[key] }, { onError: (e) => toast(e.message, 'error') });
  };
  const toggleScope = (role: Role) => {
    if (!canEdit || role.is_admin) return;
    updateRole.mutate(
      { id: role.id, default_project_scope: role.default_project_scope === 'all' ? 'assigned' : 'all' },
      { onError: (e) => toast(e.message, 'error') },
    );
  };

  const cellBtn = 'rounded-md disabled:cursor-default';

  return (
    <>
      <Card>
        <CardHeader
          title="Vai trò & quyền"
          sub="bấm một ô để đổi: Ẩn → Xem → Nhập → Toàn quyền"
          actions={
            canEdit ? (
              <>
                <DropdownMenu>
                  <DropdownTrigger asChild>
                    <Button>
                      <Icon name="content_copy" />
                      Nhân bản vai trò
                    </Button>
                  </DropdownTrigger>
                  <DropdownContent>
                    {roleList.map((r) => (
                      <DropdownItem key={r.id} onSelect={() => setRoleSheet({ mode: 'clone', role: r })}>
                        Từ “{r.name}”
                      </DropdownItem>
                    ))}
                  </DropdownContent>
                </DropdownMenu>
                <Button variant="primary" onClick={() => setRoleSheet({ mode: 'new' })}>
                  <Icon name="add" />
                  Tạo vai trò mới
                </Button>
              </>
            ) : null
          }
        />
        <div className="tbl">
          <table data-testid="perm-table">
            <thead>
              <tr>
                <th>Mục</th>
                {roleList.map((r) => {
                  const people = peopleOf(r.id);
                  return (
                    <th key={r.id} className="!text-center" data-role={r.name}>
                      <div className="inline-flex items-center gap-0.5">
                        {r.name}
                        {canEdit && !r.is_admin ? (
                          <DropdownMenu>
                            <DropdownTrigger asChild>
                              <button type="button" aria-label={`Tùy chọn vai trò ${r.name}`} className="text-faint">
                                <Icon name="more_vert" className="text-[16px]" />
                              </button>
                            </DropdownTrigger>
                            <DropdownContent>
                              <DropdownItem onSelect={() => setRoleSheet({ mode: 'rename', role: r })}>
                                <Icon name="edit" className="text-[18px] text-faint" />
                                Đổi tên
                              </DropdownItem>
                              <DropdownItem danger onSelect={() => setDeleting(r)}>
                                <Icon name="delete" className="text-[18px]" />
                                Xóa vai trò
                              </DropdownItem>
                            </DropdownContent>
                          </DropdownMenu>
                        ) : null}
                      </div>
                      <div className="max-w-[150px] truncate font-normal text-faint" title={people.join(', ')}>
                        {people.length ? people.join(', ') : 'chưa có ai'}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {(modules.data ?? []).map((m) => (
                <tr key={m.key} data-module={m.key}>
                  <td className="whitespace-nowrap">{m.label}</td>
                  {roleList.map((r) => {
                    const lv: Level = r.is_admin ? 'full' : levelOf(r.id, m.key);
                    return (
                      <td key={r.id} className="text-center">
                        <button
                          type="button"
                          className={cellBtn}
                          disabled={!canEdit || r.is_admin}
                          data-cell={`${r.name}|${m.key}`}
                          aria-label={`${m.label} — ${r.name}: ${LEVEL_LABEL[lv]}`}
                          title={r.is_admin ? 'Admin luôn toàn quyền' : 'Bấm để đổi mức'}
                          onClick={() => clickCell(r, m.key)}
                        >
                          <LevelBadge level={lv} />
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr>
                <td
                  colSpan={roleList.length + 1}
                  className="bg-surface-2 text-[11px] tracking-[.06em] text-faint uppercase"
                >
                  Quyền đặc biệt
                </td>
              </tr>
              {SPECIALS.map((key) => (
                <tr key={key}>
                  <td className="whitespace-nowrap">{SPECIAL_LABEL[key]}</td>
                  {roleList.map((r) => {
                    const on = r.is_admin || r[key];
                    return (
                      <td key={r.id} className="text-center">
                        <button
                          type="button"
                          className={cellBtn}
                          disabled={!canEdit || r.is_admin}
                          aria-label={`${SPECIAL_LABEL[key]} — ${r.name}: ${on ? 'có' : 'không'}`}
                          onClick={() => toggleSpecial(r, key)}
                        >
                          <Icon name={on ? 'check_circle' : 'remove'} className={on ? 'text-good' : 'text-faint'} />
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr>
                <td className="whitespace-nowrap">Phạm vi công trình (mặc định khi tạo tài khoản)</td>
                {roleList.map((r) => (
                  <td key={r.id} className="text-center">
                    <button
                      type="button"
                      className={cellBtn}
                      disabled={!canEdit || r.is_admin}
                      onClick={() => toggleScope(r)}
                    >
                      {r.default_project_scope === 'all' ? 'Tất cả' : <Pill tone="warn">Được giao</Pill>}
                    </button>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
      <Note>
        <b>Nhập</b> = thêm mới và sửa dòng của chính mình. <b>Toàn quyền</b> = sửa / xóa mọi dòng. Admin luôn toàn quyền,
        không tự khóa được mình. Đổi quyền xong, menu của người dùng vai trò đó tự đổi trong vòng 1 phút.
      </Note>
      <div className="sm:hidden">
        <Note icon="desktop_windows">Sửa bảng quyền chi tiết nên làm trên máy tính / máy tính bảng.</Note>
      </div>

      {roleSheet ? (
        <RoleSheet
          mode={roleSheet.mode}
          role={roleSheet.mode === 'new' ? undefined : roleSheet.role}
          roles={roleList}
          permsOf={(roleId) =>
            (modules.data ?? []).map((m) => ({ module: m.key, level: roleList.find((r) => r.id === roleId)?.is_admin ? ('full' as Level) : levelOf(roleId, m.key) }))
          }
          onClose={() => setRoleSheet(null)}
        />
      ) : null}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title="Xóa vai trò?"
        message={
          <>
            Xóa vai trò <b>{deleting?.name}</b>. Chỉ xóa được khi không còn ai dùng vai trò này.
          </>
        }
        confirmLabel="Xóa"
        danger
        busy={deleteRole.isPending}
        onConfirm={() =>
          deleting &&
          deleteRole.mutate(deleting.id, {
            onSuccess: () => {
              toast('Đã xóa vai trò');
              setDeleting(null);
            },
            onError: (e) => toast(e.message, 'error'),
          })
        }
      />
    </>
  );
}

function RoleSheet({
  mode,
  role,
  roles,
  permsOf,
  onClose,
}: {
  mode: 'new' | 'clone' | 'rename';
  role?: Role;
  roles: Role[];
  permsOf: (roleId: string) => { module: string; level: Level }[];
  onClose: () => void;
}) {
  const access = useAccess();
  const create = useCreateRole();
  const update = useUpdateRole();
  const toast = useToast();
  const [name, setName] = useState(mode === 'rename' ? (role?.name ?? '') : mode === 'clone' ? `${role?.name ?? ''} (bản sao)` : '');
  const [srcId, setSrcId] = useState(role?.id ?? '');
  const title = mode === 'rename' ? 'Đổi tên vai trò' : mode === 'clone' ? 'Nhân bản vai trò' : 'Tạo vai trò mới';

  const save = async () => {
    const n = name.trim();
    if (!n) return toast('Nhập tên vai trò', 'error');
    if (roles.some((r) => r.name.toLowerCase() === n.toLowerCase() && r.id !== role?.id)) return toast('Tên vai trò đã có', 'error');
    try {
      if (mode === 'rename' && role) await update.mutateAsync({ id: role.id, name: n });
      else {
        const src = mode === 'clone' ? roles.find((r) => r.id === srcId) : undefined;
        await create.mutateAsync({ name: n, companyId: access.company.id, copyFrom: src, copyPerms: src ? permsOf(src.id) : undefined });
      }
      toast(mode === 'rename' ? 'Đã đổi tên' : 'Đã tạo vai trò');
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    }
  };

  return (
    <Sheet
      open
      onOpenChange={(v) => !v && onClose()}
      title={title}
      footer={
        <>
          <div className="flex-1" />
          <Button onClick={onClose}>Hủy</Button>
          <Button variant="primary" disabled={create.isPending || update.isPending} onClick={save}>
            <Icon name="save" />
            Lưu
          </Button>
        </>
      }
    >
      {mode === 'clone' ? (
        <Field label="Nhân bản từ">
          <Select value={srcId} onChange={(e) => setSrcId(e.target.value)}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      <Field label="Tên vai trò">
        <Input name="role_name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </Field>
      {mode === 'new' ? <Note>Vai trò mới bắt đầu với mọi mục = Ẩn. Bấm từng ô trong bảng để mở quyền.</Note> : null}
      {mode === 'clone' && roles.find((r) => r.id === srcId)?.is_admin ? (
        <Note>Nhân bản từ Admin: bản sao có mọi mục Toàn quyền nhưng không phải Admin (không quản lý được tài khoản nếu anh tắt mục đó).</Note>
      ) : null}
    </Sheet>
  );
}
