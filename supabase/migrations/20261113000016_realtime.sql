-- Realtime: máy A lưu → mọi máy đang mở app tự tải lại phần liên quan sau ~1–2 giây (src/app/realtime.ts).
-- Chỉ bật cho bảng nghiệp vụ. Realtime vẫn kiểm tra RLS: máy nào không được xem bảng / dòng đó thì không nhận tin.
-- KHÔNG bật cho: audit_log, backups, contact_private (SĐT, CCCD), profiles, profile_projects, roles, role_permissions.
alter publication supabase_realtime add table
  public.projects, public.customers, public.workers, public.employees, public.suppliers, public.subcontractors,
  public.catalog_items,
  public.expenses, public.expense_lines,
  public.timesheet_weeks, public.timesheet_lines, public.wage_advances,
  public.payments, public.payment_allocations, public.subcontracts, public.payable_closures,
  public.main_contracts, public.receipts, public.settlements,
  public.equipment, public.cost_allocations,
  public.schedule_plans, public.schedule_phases, public.schedule_tasks, public.schedule_notes, public.schedule_templates;
