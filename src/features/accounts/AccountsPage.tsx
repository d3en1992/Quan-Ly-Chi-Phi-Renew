// Tab Tài Khoản & Quyền (chỉ Admin thấy theo bảng quyền mặc định)
import { useState } from 'react';
import { PageHeader, SubTabs } from '@/components/ui/misc';
import { AccountsTab } from './AccountsTab';
import { RolesTab } from './RolesTab';

type Sub = 'accounts' | 'roles';

export function AccountsPage() {
  const [sub, setSub] = useState<Sub>('accounts');
  return (
    <>
      <div className="hidden sm:block">
        <PageHeader title="Tài Khoản & Quyền" sub="Chỉ Admin thấy mục này" />
      </div>
      <SubTabs<Sub>
        tabs={[
          { key: 'accounts', label: 'TÀI KHOẢN' },
          { key: 'roles', label: 'VAI TRÒ & QUYỀN' },
        ]}
        value={sub}
        onChange={setSub}
      />
      {sub === 'accounts' ? <AccountsTab /> : <RolesTab />}
    </>
  );
}
