// Đăng nhập bằng tên đăng nhập + mật khẩu (nội bộ đổi thành email ẩn), và quyền của người đang dùng.
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import { z } from 'zod';
import { COMPANY_SLUG, supabase } from '@/lib/supabase';
import { toLoginEmail } from '@shared/username';
import { LEVELS, type PermissionMap } from '@/lib/permissions';

const accessSchema = z.object({
  profile: z.object({
    id: z.string(),
    username: z.string(),
    display_name: z.string(),
    must_change_password: z.boolean(),
    project_scope: z.enum(['all', 'assigned']),
    company_id: z.string(),
  }),
  company: z.object({ id: z.string(), name: z.string(), short_name: z.string().nullable(), slug: z.string() }),
  role: z.object({ id: z.string(), name: z.string(), is_admin: z.boolean() }),
  special: z.object({ see_contact_ids: z.boolean(), edit_others: z.boolean(), purge_trash: z.boolean() }),
  permissions: z.record(z.enum(LEVELS)),
  project_ids: z.array(z.string()),
});
export type MyAccess = z.infer<typeof accessSchema> & { permissions: PermissionMap };

type AuthState = {
  session: Session | null;
  sessionLoading: boolean;
  access: MyAccess | null;
  accessLoading: boolean;
  accessError: Error | null;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshAccess: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export const ACCESS_QUERY_KEY = ['my-access'] as const;

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id ?? null;
  const accessQuery = useQuery({
    queryKey: [...ACCESS_QUERY_KEY, userId],
    enabled: !!userId,
    staleTime: 30_000,
    refetchInterval: 60_000, // Admin đổi quyền → menu tự đổi trong vòng 1 phút
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_access');
      if (error) throw new Error(error.message);
      if (!data) throw new Error('Tài khoản đã bị khóa hoặc chưa được cấp quyền. Liên hệ Admin.');
      return accessSchema.parse(data) as MyAccess;
    },
  });

  const value = useMemo<AuthState>(
    () => ({
      session,
      sessionLoading,
      access: accessQuery.data ?? null,
      accessLoading: !!userId && accessQuery.isLoading,
      accessError: (accessQuery.error as Error | null) ?? null,
      signIn: async (username, password) => {
        const { error } = await supabase.auth.signInWithPassword({
          email: toLoginEmail(username, COMPANY_SLUG),
          password,
        });
        if (error) {
          if (/banned/i.test(error.message)) throw new Error('Tài khoản đã bị khóa. Liên hệ Admin.');
          if (/invalid login credentials/i.test(error.message)) throw new Error('Sai tên đăng nhập hoặc mật khẩu');
          throw new Error(error.message);
        }
      },
      signOut: async () => {
        await supabase.auth.signOut();
        qc.clear();
      },
      refreshAccess: async () => {
        await qc.invalidateQueries({ queryKey: ACCESS_QUERY_KEY });
      },
    }),
    [session, sessionLoading, accessQuery.data, accessQuery.isLoading, accessQuery.error, userId, qc],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth phải nằm trong AuthProvider');
  return ctx;
}

/** Dùng trong các màn đã đăng nhập (sau RequireAuth) */
export function useAccess(): MyAccess {
  const { access } = useAuth();
  if (!access) throw new Error('Chưa có thông tin quyền');
  return access;
}
