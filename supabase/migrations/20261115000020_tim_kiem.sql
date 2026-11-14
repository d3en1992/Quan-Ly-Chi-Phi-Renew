-- GĐ99: TÌM KIẾM CHUNG (ô tìm trên thanh trên / nút 🔍 / nút Trợ lý AI) — đề xuất ở tai-lieu/DE-XUAT-TIM-KIEM.md.
-- search_all(q, terms, kinds, limit): tìm dữ liệu thật trong 10 nhóm (công trình, danh bạ, cửa hàng, khoản chi + dòng vật tư,
-- HĐ thầu phụ, phiếu chi, sổ chấm công, thiết bị, HĐ chính, phiếu thu). Gõ không dấu vẫn ra (unaccent).
--   • q: chữ người dùng gõ — dòng khớp khi chứa ĐỦ mọi từ (ở bất kỳ cột nào của dòng, kể cả tên công trình / NCC / thầu phụ đi kèm).
--   • terms: từ khóa AI gợi thêm (vd "dây điện" → {"cap 1.5","cv 2.5","cadivi"}) — dòng khớp khi chứa đủ các từ của MỘT term.
--   • kinds: chỉ tìm trong các nhóm này (rỗng = mọi nhóm).
-- SECURITY INVOKER: chạy bằng quyền người gọi → RLS của từng bảng tự lọc theo quyền + phạm vi công trình (không lộ gì thêm).
-- Không cộng trừ tiền ở đây: amount chỉ là số tiền của CHÍNH dòng đó để hiển thị.

create extension if not exists unaccent with schema extensions;

-- Chuẩn hóa để so: bỏ dấu (đ → d), chữ thường, ký tự lạ → khoảng trắng (giữ số thập phân "1.5"), gộp khoảng trắng
create or replace function public.search_norm(t text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select btrim(regexp_replace(lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(t, ''))), '[^a-z0-9.]+', ' ', 'g'))
$$;

-- hay (đã chuẩn hóa) chứa đủ mọi từ của q, hoặc đủ mọi từ của một term. Khớp theo ĐẦU TỪ ("hung" ra "Hưng", không ra "Phùng")
create or replace function public.search_hit(hay text, q text, terms text[]) returns boolean
language sql immutable parallel safe set search_path = '' as $$
  select
    (public.search_norm(q) <> '' and not exists (
      select 1 from unnest(string_to_array(public.search_norm(q), ' ')) w where w <> '' and position(' ' || w in ' ' || hay) = 0))
    or exists (
      select 1 from unnest(coalesce(terms, '{}'::text[])) t
      where public.search_norm(t) <> '' and not exists (
        select 1 from unnest(string_to_array(public.search_norm(t), ' ')) w where w <> '' and position(' ' || w in ' ' || hay) = 0))
$$;

create or replace function public.search_all(p_q text, p_terms text[] default '{}', p_kinds text[] default '{}', p_limit int default 5)
returns table (kind text, id uuid, title text, sub text, amount bigint, date date, project_id uuid, extra text, total int)
language sql stable security invoker set search_path = '' as $$
  with
  want as (select coalesce(p_kinds, '{}'::text[]) as k),
  pj as (select p.id, p.name from public.projects p where p.deleted_at is null),
  hits as (
    -- CÔNG TRÌNH
    select 'project'::text as kind, p.id, p.name as title,
      concat_ws(' · ', nullif(p.owner_name, ''), nullif(p.address, '')) as sub,
      null::bigint as amount, p.start_date as date, p.id as project_id, p.status as extra
    from public.projects p, want
    where p.deleted_at is null and (cardinality(want.k) = 0 or 'project' = any(want.k))
      and public.search_hit(public.search_norm(concat_ws(' ', p.name, p.owner_name, p.address, array_to_string(p.aliases, ' '), p.note)), p_q, p_terms)

    -- DANH BẠ (5 nhóm) — extra = nhóm (customer / subcontractor / supplier / worker / employee) để mở đúng tab
    union all
    select 'contact', c.id, c.name, concat_ws(' · ', 'Khách hàng', nullif(c.full_name, ''), nullif(c.address, '')), null, null, null, 'customer'
    from public.customers c, want
    where c.deleted_at is null and (cardinality(want.k) = 0 or 'contact' = any(want.k))
      and public.search_hit(public.search_norm(concat_ws(' ', 'khach hang', c.name, c.full_name, c.address, c.note)), p_q, p_terms)
    union all
    select 'contact', s.id, s.name, concat_ws(' · ', 'Thầu phụ', nullif(s.field, ''), nullif(s.contact_person, '')), null, null, null, 'subcontractor'
    from public.subcontractors s, want
    where s.deleted_at is null and (cardinality(want.k) = 0 or 'contact' = any(want.k))
      and public.search_hit(public.search_norm(concat_ws(' ', 'thau phu', s.name, s.field, s.contact_person, s.note)), p_q, p_terms)
    union all
    select 'contact', s.id, s.name, concat_ws(' · ', 'Nhà cung cấp', nullif(s.phone, ''), nullif(s.address, '')), null, null, null, 'supplier'
    from public.suppliers s, want
    where s.deleted_at is null and (cardinality(want.k) = 0 or 'contact' = any(want.k))
      and public.search_hit(public.search_norm(concat_ws(' ', 'nha cung cap ncc', s.name, s.phone, s.address, s.note)), p_q, p_terms)
    union all
    select 'contact', w.id, w.name, concat_ws(' · ', 'Công nhân', nullif(w.role, ''), nullif(w.full_name, '')), null, null, null, 'worker'
    from public.workers w, want
    where w.deleted_at is null and (cardinality(want.k) = 0 or 'contact' = any(want.k))
      and public.search_hit(public.search_norm(concat_ws(' ', 'cong nhan tho', w.name, w.full_name, w.role, w.note)), p_q, p_terms)
    union all
    select 'contact', e.id, e.full_name, concat_ws(' · ', 'Nhân viên', nullif(e.title, '')), null, null, null, 'employee'
    from public.employees e, want
    where e.deleted_at is null and (cardinality(want.k) = 0 or 'contact' = any(want.k))
      and public.search_hit(public.search_norm(concat_ws(' ', 'nhan vien', e.full_name, e.title, e.note)), p_q, p_terms)

    -- CỬA HÀNG
    union all
    select 'shop', s.id, s.name, concat_ws(' · ', nullif(s.area, ''), nullif(s.phone, ''), nullif(s.address, '')), null, null, null, null
    from public.shops s, want
    where s.deleted_at is null and (cardinality(want.k) = 0 or 'shop' = any(want.k))
      and public.search_hit(public.search_norm(concat_ws(' ', s.name, s.address, s.area, s.phone, s.details)), p_q, p_terms)

    -- KHOẢN CHI (+ tên dòng vật tư, NCC, loại chi phí, công trình)
    union all
    select 'expense', e.id, e.description, concat_ws(' · ', pj.name, sp.name), e.amount, e.date, e.project_id, null
    from public.expenses e
    cross join want
    left join pj on pj.id = e.project_id
    left join public.suppliers sp on sp.id = e.supplier_id
    left join public.catalog_items ct on ct.id = e.expense_type_id
    where e.deleted_at is null and (cardinality(want.k) = 0 or 'expense' = any(want.k))
      and public.search_hit(public.search_norm(concat_ws(' ', e.description, e.invoice_no, pj.name, sp.name, ct.name,
        (select string_agg(l.name, ' ') from public.expense_lines l where l.expense_id = e.id and l.deleted_at is null))), p_q, p_terms)

    -- HỢP ĐỒNG THẦU PHỤ
    union all
    select 'subcontract', s.id, concat_ws(' · ', sc.name, nullif(s.description, '')), pj.name, s.value, s.date, s.project_id, null
    from public.subcontracts s
    cross join want
    left join pj on pj.id = s.project_id
    left join public.subcontractors sc on sc.id = s.subcontractor_id
    where s.deleted_at is null and (cardinality(want.k) = 0 or 'subcontract' = any(want.k))
      and public.search_hit(public.search_norm(concat_ws(' ', 'hop dong thau phu', sc.name, sc.field, s.description, pj.name)), p_q, p_terms)

    -- PHIẾU CHI (tạm ứng / thanh toán thầu phụ, trả nợ NCC)
    union all
    select 'payment', p.id,
      concat_ws(' · ', case p.kind when 'advance' then 'Tạm ứng' when 'progress' then 'Thanh toán' else 'Trả NCC' end, coalesce(sc.name, sp.name)),
      concat_ws(' · ', pj.name, nullif(p.note, '')), p.amount, p.date, p.project_id, null
    from public.payments p
    cross join want
    left join pj on pj.id = p.project_id
    left join public.subcontractors sc on sc.id = p.subcontractor_id
    left join public.suppliers sp on sp.id = p.supplier_id
    where p.deleted_at is null and (cardinality(want.k) = 0 or 'payment' = any(want.k))
      and public.search_hit(public.search_norm(concat_ws(' ', 'phieu chi',
        case p.kind when 'advance' then 'tam ung' when 'progress' then 'thanh toan' else 'tra ncc' end, sc.name, sp.name, pj.name, p.note)), p_q, p_terms)

    -- SỔ CHẤM CÔNG (1 tuần của 1 công trình; tìm theo công trình, tên công nhân, ghi chú)
    union all
    select 'timesheet', w.id, concat_ws(' · ', 'Tuần ' || to_char(w.week_start, 'DD/MM/YYYY'), pj.name),
      (select string_agg(distinct wk.name, ', ') from public.timesheet_lines l join public.workers wk on wk.id = l.worker_id
        where l.week_id = w.id and l.deleted_at is null), null, w.week_start, w.project_id, null
    from public.timesheet_weeks w
    cross join want
    left join pj on pj.id = w.project_id
    where w.deleted_at is null and (cardinality(want.k) = 0 or 'timesheet' = any(want.k))
      and public.search_hit(public.search_norm(concat_ws(' ', pj.name, w.note, to_char(w.week_start, 'MM/YYYY'),
        (select string_agg(wk.name, ' ') from public.timesheet_lines l join public.workers wk on wk.id = l.worker_id
          where l.week_id = w.id and l.deleted_at is null))), p_q, p_terms)

    -- THIẾT BỊ
    union all
    select 'equipment', q.id, ci.name, concat_ws(' · ', coalesce(pj.name, case q.location when 'warehouse' then 'Kho thiết bị' when 'scaffold' then 'Kho giàn giáo' end), 'SL ' || trim_scale(q.quantity)),
      null, q.date, q.project_id, null
    from public.equipment q
    cross join want
    left join pj on pj.id = q.project_id
    left join public.catalog_items ci on ci.id = q.name_id
    where q.deleted_at is null and (cardinality(want.k) = 0 or 'equipment' = any(want.k))
      and public.search_hit(public.search_norm(concat_ws(' ', ci.name, case q.location when 'warehouse' then 'kho thiet bi' when 'scaffold' then 'kho gian giao' end, pj.name, q.note)), p_q, p_terms)

    -- HỢP ĐỒNG CHÍNH
    union all
    select 'main_contract', m.id, concat_ws(' · ', 'HĐ chính', pj.name), concat_ws(' · ', nullif(m.customer_name, ''), nullif(m.description, '')),
      m.value, m.date, m.project_id, null
    from public.main_contracts m
    cross join want
    left join pj on pj.id = m.project_id
    where m.deleted_at is null and (cardinality(want.k) = 0 or 'main_contract' = any(want.k))
      and public.search_hit(public.search_norm(concat_ws(' ', 'hop dong chinh', pj.name, m.customer_name, m.description)), p_q, p_terms)

    -- PHIẾU THU
    union all
    select 'receipt', r.id, concat_ws(' · ', 'Thu tiền', pj.name), concat_ws(' · ', nullif(r.method, ''), nullif(r.note, '')),
      r.amount, r.date, r.project_id, null
    from public.receipts r
    cross join want
    left join pj on pj.id = r.project_id
    where r.deleted_at is null and (cardinality(want.k) = 0 or 'receipt' = any(want.k))
      and public.search_hit(public.search_norm(concat_ws(' ', 'thu tien phieu thu', pj.name, r.method, r.note)), p_q, p_terms)
  ),
  ranked as (
    select h.*, row_number() over (partition by h.kind order by h.date desc nulls last, h.title) as rn,
      (count(*) over (partition by h.kind))::int as total
    from hits h
  )
  select r.kind, r.id, r.title, r.sub, r.amount, r.date, r.project_id, r.extra, r.total
  from ranked r
  where r.rn <= greatest(1, least(coalesce(p_limit, 5), 200))
  order by r.kind, r.rn
$$;

comment on function public.search_all is 'Tìm kiếm chung (ô tìm thanh trên / nút AI) — chạy bằng quyền người gọi, RLS tự lọc';

revoke all on function public.search_all(text, text[], text[], int) from public, anon;
grant execute on function public.search_all(text, text[], text[], int) to authenticated, service_role;
grant execute on function public.search_norm(text) to authenticated, service_role;
grant execute on function public.search_hit(text, text, text[]) to authenticated, service_role;

-- Danh sách tên vật tư / nội dung chi (không trùng) cho nút "Tìm bằng AI" khớp tên ghi khác (dây điện ↔ cáp 1.5)
create or replace function public.search_vocab(p_limit int default 3000)
returns table (name text, n int)
language sql stable security invoker set search_path = '' as $$
  select v.name, count(*)::int as n from (
    select btrim(l.name) as name from public.expense_lines l where l.deleted_at is null and coalesce(btrim(l.name), '') <> ''
    union all
    select btrim(c.name) from public.catalog_items c where c.kind in ('expense_type', 'equipment_name')
  ) v
  group by v.name
  order by count(*) desc, v.name
  limit greatest(1, least(coalesce(p_limit, 3000), 5000))
$$;
revoke all on function public.search_vocab(int) from public, anon;
grant execute on function public.search_vocab(int) to authenticated, service_role;
