// Các phần của thanh trên: chọn năm, tài khoản (đổi tên, đổi MK, sáng/tối, đăng xuất)
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Icon } from '@/components/ui/button';
import {
  DropdownCheckItem,
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
  DropdownSeparator,
  DropdownTrigger,
} from '@/components/ui/dropdown';
import { Sheet } from '@/components/ui/sheet';
import { Field, Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { initials } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { ACCESS_QUERY_KEY, useAccess, useAuth } from './auth';
import { toggleTheme } from './theme';
import { useYears } from './year';

/** `tiny` = đầu trang điện thoại: bỏ biểu tượng lịch, chừa chỗ cho tên trang */
export function YearPicker({ compact = false, tiny = false }: { compact?: boolean; tiny?: boolean }) {
  const { years, setYears, options, label } = useYears();
  const toggle = (y: number) => {
    if (years === 'all') return setYears([y]);
    const next = years.includes(y) ? years.filter((x) => x !== y) : [...years, y];
    setYears(next.length ? next : 'all');
  };
  return (
    <DropdownMenu>
      <DropdownTrigger asChild>
        <button
          type="button"
          aria-label="Chọn năm"
          className={tiny ? 'inline-flex h-[34px] shrink-0 items-center gap-0.5 rounded-lg border border-line bg-surface pr-1 pl-2 text-[13px] font-semibold whitespace-nowrap' : 'inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] whitespace-nowrap'}
        >
          {tiny ? null : <Icon name="event" className="text-[17px] text-faint" />}
          <span data-testid="year-label">{compact && years !== 'all' && years.length > 1 ? `${years.length} năm` : label}</span>
          <Icon name="expand_more" className="text-[17px] text-faint" />
        </button>
      </DropdownTrigger>
      <DropdownContent className="min-w-[180px]">
        <DropdownLabel>Lọc theo năm</DropdownLabel>
        <DropdownCheckItem checked={years === 'all'} onToggle={() => setYears('all')}>
          Tất cả các năm
        </DropdownCheckItem>
        <DropdownSeparator />
        {options.map((y) => (
          <DropdownCheckItem key={y} checked={years !== 'all' && years.includes(y)} onToggle={() => toggle(y)}>
            {y}
          </DropdownCheckItem>
        ))}
      </DropdownContent>
    </DropdownMenu>
  );
}

export function Avatar({ name }: { name: string }) {
  return (
    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent-soft text-[11px] font-bold text-accent">
      {initials(name)}
    </span>
  );
}

export function AccountMenu({ compact = false }: { compact?: boolean }) {
  const access = useAccess();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [renameOpen, setRenameOpen] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownTrigger asChild>
          <button
            type="button"
            aria-label="Tài khoản"
            data-testid="account-chip"
            className="inline-flex min-w-0 items-center gap-1.5 rounded-lg border border-line bg-surface py-[3px] pr-2.5 pl-1 text-[13px] whitespace-nowrap"
          >
            <Avatar name={access.profile.display_name} />
            {compact ? null : (
              <span className="truncate">
                {access.profile.display_name} · {access.role.name}
              </span>
            )}
          </button>
        </DropdownTrigger>
        <DropdownContent>
          <DropdownLabel>
            {access.profile.display_name} · {access.role.name}
          </DropdownLabel>
          <DropdownItem onSelect={() => setRenameOpen(true)}>
            <Icon name="badge" className="text-[18px] text-faint" />
            Đổi tên hiển thị
          </DropdownItem>
          <DropdownItem onSelect={() => navigate('/doi-mat-khau')}>
            <Icon name="key" className="text-[18px] text-faint" />
            Đổi mật khẩu
          </DropdownItem>
          <DropdownItem onSelect={() => toggleTheme()}>
            <Icon name="dark_mode" className="text-[18px] text-faint" />
            Đổi sáng / tối
          </DropdownItem>
          <DropdownSeparator />
          <DropdownItem danger onSelect={() => void signOut()}>
            <Icon name="logout" className="text-[18px]" />
            Đăng xuất
          </DropdownItem>
        </DropdownContent>
      </DropdownMenu>
      <RenameSheet key={renameOpen ? 'open' : 'closed'} open={renameOpen} onOpenChange={setRenameOpen} current={access.profile.display_name} />
    </>
  );
}

function RenameSheet({ open, onOpenChange, current }: { open: boolean; onOpenChange: (v: boolean) => void; current: string }) {
  const [name, setName] = useState(current);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const qc = useQueryClient();
  const save = async () => {
    setBusy(true);
    const { error } = await supabase.rpc('update_my_display_name', { new_name: name });
    setBusy(false);
    if (error) return toast(error.message, 'error');
    await qc.invalidateQueries({ queryKey: ACCESS_QUERY_KEY });
    toast('Đã đổi tên hiển thị');
    onOpenChange(false);
  };
  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (v) setName(current);
        onOpenChange(v);
      }}
      title="Đổi tên hiển thị"
      footer={
        <>
          <div className="flex-1" />
          <Button onClick={() => onOpenChange(false)}>Hủy</Button>
          <Button variant="primary" disabled={busy || !name.trim()} onClick={save}>
            <Icon name="save" />
            Lưu
          </Button>
        </>
      }
    >
      <Field label="Tên hiển thị (dùng làm Người TH)">
        <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </Field>
    </Sheet>
  );
}
