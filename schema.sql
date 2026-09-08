-- University Project Portal - Supabase schema
-- Run this entire file in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text,
  role text not null default 'student' check (role in ('student','lecturer','admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  matric_number text not null unique,
  department text not null,
  level text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lecturers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  staff_id text not null unique,
  department text not null,
  specialization text,
  max_students integer not null default 10 check (max_students > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_topics (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  department text not null,
  research_area text,
  lecturer_id uuid references public.lecturers(id) on delete set null,
  max_students integer not null default 1 check (max_students > 0),
  status text not null default 'available' check (status in ('draft','available','pending','approved','rejected','full','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_allocations (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  topic_id uuid not null references public.project_topics(id) on delete cascade,
  lecturer_id uuid not null references public.lecturers(id) on delete restrict,
  status text not null default 'active' check (status in ('pending','active','completed','cancelled')),
  allocated_at timestamptz not null default now(),
  unique(student_id, topic_id)
);

create table if not exists public.project_progress (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null unique references public.students(id) on delete cascade,
  percentage integer not null default 0 check (percentage between 0 and 100),
  current_stage text,
  description text,
  updated_at timestamptz not null default now()
);

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  title text not null,
  chapter text,
  description text,
  file_path text,
  status text not null default 'pending' check (status in ('draft','pending','approved','rejected','revision_required')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  lecturer_id uuid not null references public.lecturers(id) on delete cascade,
  comment text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  message text not null check (length(trim(message)) > 0),
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_topics_department_status on public.project_topics(department, status);
create index if not exists idx_allocations_student on public.project_allocations(student_id);
create index if not exists idx_allocations_lecturer on public.project_allocations(lecturer_id);
create index if not exists idx_submissions_student on public.submissions(student_id);
create index if not exists idx_messages_receiver_created on public.messages(receiver_id, created_at desc);
create index if not exists idx_notifications_user_created on public.notifications(user_id, created_at desc);

-- Role helper avoids recursive RLS policy checks on profiles.
create or replace function public.current_user_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role from public.profiles where id = auth.uid();
$$;

grant execute on function public.current_user_role() to authenticated;

-- Create profile/student/lecturer records automatically after Auth signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role text := coalesce(new.raw_user_meta_data->>'role', 'student');
  full_name_value text := coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1));
  identifier_value text := new.raw_user_meta_data->>'identifier';
  department_value text := new.raw_user_meta_data->>'department';
begin
  if requested_role not in ('student','lecturer') then
    requested_role := 'student';
  end if;

  insert into public.profiles(id, full_name, email, role)
  values(new.id, full_name_value, new.email, requested_role)
  on conflict (id) do update set full_name = excluded.full_name, email = excluded.email, role = excluded.role;

  if requested_role = 'student' then
    insert into public.students(user_id, matric_number, department)
    values(new.id, identifier_value, coalesce(department_value, 'Unspecified'))
    on conflict (user_id) do nothing;
  elsif requested_role = 'lecturer' then
    insert into public.lecturers(user_id, staff_id, department)
    values(new.id, identifier_value, coalesce(department_value, 'Unspecified'))
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Safely request a topic: one student may have one active/pending project.
create or replace function public.request_project_topic(p_topic_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  student_record public.students%rowtype;
  topic_record public.project_topics%rowtype;
  allocation_id uuid;
  active_count integer;
begin
  select * into student_record from public.students where user_id = auth.uid();
  if student_record.id is null then raise exception 'Student profile not found'; end if;

  if exists(select 1 from public.project_allocations where student_id = student_record.id and status in ('pending','active')) then
    raise exception 'You already have a project allocation';
  end if;

  select * into topic_record from public.project_topics where id = p_topic_id for update;
  if topic_record.id is null then raise exception 'Topic not found'; end if;
  if topic_record.status not in ('available','approved') then raise exception 'Topic is not available'; end if;
  if topic_record.lecturer_id is null then raise exception 'Topic has no lecturer'; end if;

  select count(*) into active_count from public.project_allocations where topic_id = p_topic_id and status in ('pending','active');
  if active_count >= topic_record.max_students then
    update public.project_topics set status = 'full', updated_at = now() where id = p_topic_id;
    raise exception 'Topic is already full';
  end if;

  insert into public.project_allocations(student_id, topic_id, lecturer_id, status)
  values(student_record.id, topic_record.id, topic_record.lecturer_id, 'pending')
  returning id into allocation_id;

  if active_count + 1 >= topic_record.max_students then
    update public.project_topics set status = 'full', updated_at = now() where id = p_topic_id;
  end if;

  return allocation_id;
end;
$$;

grant execute on function public.request_project_topic(uuid) to authenticated;

create or replace function public.propose_project_topic(p_title text, p_description text, p_department text, p_research_area text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare topic_id uuid;
begin
  if public.current_user_role() <> 'student' then raise exception 'Student access required'; end if;
  insert into public.project_topics(title, description, department, research_area, lecturer_id, max_students, status)
  values(trim(p_title), trim(p_description), trim(p_department), nullif(trim(p_research_area), ''), null, 1, 'pending')
  returning id into topic_id;
  return topic_id;
end;
$$;

grant execute on function public.propose_project_topic(text,text,text,text) to authenticated;


create or replace function public.allocate_project(p_student_id uuid, p_topic_id uuid, p_lecturer_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare allocation_id uuid;
begin
  if public.current_user_role() <> 'admin' then raise exception 'Administrator access required'; end if;
  if not exists(select 1 from public.students where id = p_student_id) then raise exception 'Student not found'; end if;
  if not exists(select 1 from public.project_topics where id = p_topic_id) then raise exception 'Topic not found'; end if;
  if not exists(select 1 from public.lecturers where id = p_lecturer_id) then raise exception 'Lecturer not found'; end if;

  insert into public.project_allocations(student_id, topic_id, lecturer_id, status)
  values(p_student_id, p_topic_id, p_lecturer_id, 'active')
  on conflict(student_id, topic_id) do update set lecturer_id = excluded.lecturer_id, status = 'active'
  returning id into allocation_id;
  return allocation_id;
end;
$$;

grant execute on function public.allocate_project(uuid,uuid,uuid) to authenticated;

create or replace function public.review_submission(p_submission_id uuid, p_lecturer_id uuid, p_status text, p_comment text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare feedback_id uuid;
begin
  if public.current_user_role() <> 'lecturer' then raise exception 'Lecturer access required'; end if;
  if p_status not in ('approved','rejected','revision_required') then raise exception 'Invalid status'; end if;
  if not exists (
    select 1 from public.submissions s
    join public.project_allocations a on a.student_id = s.student_id
    where s.id = p_submission_id and a.lecturer_id = p_lecturer_id and a.status in ('pending','active')
  ) then raise exception 'Submission is not assigned to this lecturer'; end if;

  update public.submissions set status = p_status, reviewed_at = now() where id = p_submission_id;
  insert into public.feedback(submission_id, lecturer_id, comment) values(p_submission_id, p_lecturer_id, p_comment) returning id into feedback_id;
  return feedback_id;
end;
$$;

grant execute on function public.review_submission(uuid,uuid,text,text) to authenticated;

-- RLS
alter table public.profiles enable row level security;
alter table public.students enable row level security;
alter table public.lecturers enable row level security;
alter table public.project_topics enable row level security;
alter table public.project_allocations enable row level security;
alter table public.project_progress enable row level security;
alter table public.submissions enable row level security;
alter table public.feedback enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;

-- Profiles
 drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated using (id = auth.uid() or public.current_user_role() = 'admin');
 drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated using (id = auth.uid() or public.current_user_role() = 'admin') with check (id = auth.uid() or public.current_user_role() = 'admin');

-- Students
 drop policy if exists students_select on public.students;
create policy students_select on public.students for select to authenticated using (user_id = auth.uid() or public.current_user_role() in ('lecturer','admin'));
 drop policy if exists students_update_own on public.students;
create policy students_update_own on public.students for update to authenticated using (user_id = auth.uid() or public.current_user_role() = 'admin') with check (user_id = auth.uid() or public.current_user_role() = 'admin');

-- Lecturers
 drop policy if exists lecturers_select on public.lecturers;
create policy lecturers_select on public.lecturers for select to authenticated using (user_id = auth.uid() or public.current_user_role() in ('student','lecturer','admin'));
 drop policy if exists lecturers_update on public.lecturers;
create policy lecturers_update on public.lecturers for update to authenticated using (user_id = auth.uid() or public.current_user_role() = 'admin') with check (user_id = auth.uid() or public.current_user_role() = 'admin');

-- Topics
 drop policy if exists topics_select on public.project_topics;
create policy topics_select on public.project_topics for select to authenticated using (status in ('available','approved','full') or lecturer_id in (select id from public.lecturers where user_id = auth.uid()) or public.current_user_role() = 'admin');
 drop policy if exists topics_insert_lecturer on public.project_topics;
create policy topics_insert_lecturer on public.project_topics for insert to authenticated with check (public.current_user_role() = 'lecturer' and lecturer_id in (select id from public.lecturers where user_id = auth.uid()));
 drop policy if exists topics_update_owner_admin on public.project_topics;
create policy topics_update_owner_admin on public.project_topics for update to authenticated using (lecturer_id in (select id from public.lecturers where user_id = auth.uid()) or public.current_user_role() = 'admin') with check (lecturer_id in (select id from public.lecturers where user_id = auth.uid()) or public.current_user_role() = 'admin');

-- Allocations
 drop policy if exists allocations_select on public.project_allocations;
create policy allocations_select on public.project_allocations for select to authenticated using (
  student_id in (select id from public.students where user_id = auth.uid())
  or lecturer_id in (select id from public.lecturers where user_id = auth.uid())
  or public.current_user_role() = 'admin'
);

-- Progress
 drop policy if exists progress_select on public.project_progress;
create policy progress_select on public.project_progress for select to authenticated using (
  student_id in (select id from public.students where user_id = auth.uid())
  or student_id in (select a.student_id from public.project_allocations a join public.lecturers l on l.id = a.lecturer_id where l.user_id = auth.uid())
  or public.current_user_role() = 'admin'
);
 drop policy if exists progress_insert_own on public.project_progress;
create policy progress_insert_own on public.project_progress for insert to authenticated with check (student_id in (select id from public.students where user_id = auth.uid()));
 drop policy if exists progress_update_own on public.project_progress;
create policy progress_update_own on public.project_progress for update to authenticated using (student_id in (select id from public.students where user_id = auth.uid()) or public.current_user_role() = 'admin') with check (student_id in (select id from public.students where user_id = auth.uid()) or public.current_user_role() = 'admin');

-- Submissions
 drop policy if exists submissions_select on public.submissions;
create policy submissions_select on public.submissions for select to authenticated using (
  student_id in (select id from public.students where user_id = auth.uid())
  or student_id in (select a.student_id from public.project_allocations a join public.lecturers l on l.id = a.lecturer_id where l.user_id = auth.uid())
  or public.current_user_role() = 'admin'
);
 drop policy if exists submissions_insert_own on public.submissions;
create policy submissions_insert_own on public.submissions for insert to authenticated with check (student_id in (select id from public.students where user_id = auth.uid()));
 drop policy if exists submissions_update on public.submissions;
create policy submissions_update on public.submissions for update to authenticated using (student_id in (select id from public.students where user_id = auth.uid()) or public.current_user_role() in ('lecturer','admin')) with check (student_id in (select id from public.students where user_id = auth.uid()) or public.current_user_role() in ('lecturer','admin'));

-- Feedback
 drop policy if exists feedback_select on public.feedback;
create policy feedback_select on public.feedback for select to authenticated using (
  submission_id in (select s.id from public.submissions s where s.student_id in (select id from public.students where user_id = auth.uid()))
  or lecturer_id in (select id from public.lecturers where user_id = auth.uid())
  or public.current_user_role() = 'admin'
);
 drop policy if exists feedback_insert_lecturer on public.feedback;
create policy feedback_insert_lecturer on public.feedback for insert to authenticated with check (lecturer_id in (select id from public.lecturers where user_id = auth.uid()));

-- Messages
 drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select to authenticated using (sender_id = auth.uid() or receiver_id = auth.uid() or public.current_user_role() = 'admin');
 drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert to authenticated with check (sender_id = auth.uid());
 drop policy if exists messages_update_receiver on public.messages;
create policy messages_update_receiver on public.messages for update to authenticated using (receiver_id = auth.uid()) with check (receiver_id = auth.uid());

-- Notifications
 drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select to authenticated using (user_id = auth.uid() or public.current_user_role() = 'admin');
 drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications for update to authenticated using (user_id = auth.uid() or public.current_user_role() = 'admin') with check (user_id = auth.uid() or public.current_user_role() = 'admin');

-- Storage bucket and policies
insert into storage.buckets (id, name, public) values ('project-documents', 'project-documents', false) on conflict (id) do nothing;

drop policy if exists project_documents_select on storage.objects;
create policy project_documents_select on storage.objects for select to authenticated using (
  bucket_id = 'project-documents' and (
    (storage.foldername(name))[1] = (select id::text from public.students where user_id = auth.uid())
    or public.current_user_role() in ('lecturer','admin')
  )
);

drop policy if exists project_documents_insert on storage.objects;
create policy project_documents_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'project-documents' and (storage.foldername(name))[1] = (select id::text from public.students where user_id = auth.uid())
);

drop policy if exists project_documents_delete on storage.objects;
create policy project_documents_delete on storage.objects for delete to authenticated using (
  bucket_id = 'project-documents' and ((storage.foldername(name))[1] = (select id::text from public.students where user_id = auth.uid()) or public.current_user_role() = 'admin')
);

-- Realtime (safe if already enabled in a project)
do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null; end $$;

-- ============================================================================
-- Production workflow extensions
-- ============================================================================

create table if not exists public.academic_sessions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  start_date date not null,
  end_date date not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  check (end_date > start_date)
);

insert into public.academic_sessions(name, start_date, end_date, is_active)
values ('2026/2027', '2026-09-01', '2027-08-31', true)
on conflict (name) do nothing;

alter table public.project_topics add column if not exists proposed_by uuid references public.students(id) on delete set null;
alter table public.project_topics add column if not exists academic_session_id uuid references public.academic_sessions(id) on delete set null;
alter table public.project_allocations add column if not exists academic_session_id uuid references public.academic_sessions(id) on delete set null;
alter table public.submissions add column if not exists version integer not null default 1 check (version > 0);
alter table public.submissions add column if not exists reviewed_by uuid references public.lecturers(id) on delete set null;
alter table public.submissions add column if not exists updated_at timestamptz not null default now();
alter table public.notifications add column if not exists type text not null default 'general';
alter table public.notifications add column if not exists reference_id uuid;
alter table public.notifications add column if not exists read_at timestamptz;

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.submission_reviews (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  lecturer_id uuid not null references public.lecturers(id) on delete restrict,
  status text not null check (status in ('approved','rejected','revision_required')),
  comment text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_topics_session on public.project_topics(academic_session_id);
create index if not exists idx_topics_proposed_by on public.project_topics(proposed_by);
create index if not exists idx_allocations_session on public.project_allocations(academic_session_id);
create index if not exists idx_submissions_student_status on public.submissions(student_id, status, submitted_at desc);
create index if not exists idx_messages_conversation on public.messages(sender_id, receiver_id, created_at desc);
create index if not exists idx_audit_logs_entity on public.audit_logs(entity_type, entity_id, created_at desc);
create index if not exists idx_audit_logs_user on public.audit_logs(user_id, created_at desc);
create index if not exists idx_reviews_submission on public.submission_reviews(submission_id, created_at desc);

-- A student may have only one active/pending project allocation.
create unique index if not exists uq_one_open_allocation_per_student
on public.project_allocations(student_id)
where status in ('pending','active');

-- A topic cannot exceed its configured capacity for open allocations.
create or replace function public.notify_user(
  p_user_id uuid,
  p_title text,
  p_message text,
  p_type text default 'general',
  p_reference_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare notification_id uuid;
begin
  if p_user_id is null then return null; end if;
  insert into public.notifications(user_id, title, message, type, reference_id)
  values(p_user_id, p_title, p_message, p_type, p_reference_id)
  returning id into notification_id;
  return notification_id;
end;
$$;
revoke all on function public.notify_user(uuid,text,text,text,uuid) from public, authenticated, anon;

create or replace function public.write_audit_log(
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_description text default null,
  p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare log_id uuid;
begin
  insert into public.audit_logs(user_id, action, entity_type, entity_id, description, metadata)
  values(auth.uid(), p_action, p_entity_type, p_entity_id, p_description, coalesce(p_metadata, '{}'::jsonb))
  returning id into log_id;
  return log_id;
end;
$$;
revoke all on function public.write_audit_log(text,text,uuid,text,jsonb) from public, authenticated, anon;

create or replace function public.get_active_academic_session()
returns uuid
language sql security definer set search_path = public stable
as $$
  select id from public.academic_sessions where is_active = true order by start_date desc limit 1;
$$;
grant execute on function public.get_active_academic_session() to authenticated;

-- Student proposals are tied to their owner and the active academic session.
create or replace function public.propose_project_topic(
  p_title text,
  p_description text,
  p_department text,
  p_research_area text default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare topic_id uuid; student_id uuid; session_id uuid;
begin
  if public.current_user_role() <> 'student' then raise exception 'Student access required'; end if;
  select id into student_id from public.students where user_id = auth.uid();
  if student_id is null then raise exception 'Student profile not found'; end if;
  if length(trim(p_title)) < 5 or length(trim(p_description)) < 10 then raise exception 'Topic title or description is too short'; end if;
  select public.get_active_academic_session() into session_id;
  insert into public.project_topics(title, description, department, research_area, lecturer_id, max_students, status, proposed_by, academic_session_id)
  values(trim(p_title), trim(p_description), trim(p_department), nullif(trim(p_research_area), ''), null, 1, 'pending', student_id, session_id)
  returning id into topic_id;
  perform public.notify_user((select id from public.profiles where role = 'admin' order by created_at limit 1), 'New topic proposal', 'A student has proposed a new project topic for review.', 'topic_proposed', topic_id);
  return topic_id;
end;
$$;
grant execute on function public.propose_project_topic(text,text,text,text) to authenticated;

-- Admin-only atomic allocation with capacity, session, and duplicate checks.
create or replace function public.allocate_project(p_student_id uuid, p_topic_id uuid, p_lecturer_id uuid)
returns uuid language plpgsql security definer set search_path = public
as $$
declare allocation_id uuid; session_id uuid; max_students integer; open_count integer; lecturer_capacity integer; lecturer_load integer; topic_department text; lecturer_department text; existing_allocation public.project_allocations%rowtype;
begin
  if public.current_user_role() <> 'admin' then raise exception 'Administrator access required'; end if;
  select * into existing_allocation from public.project_allocations where student_id=p_student_id and status in ('pending','active') order by allocated_at desc limit 1 for update;
  select t.max_students, t.department into max_students, topic_department from public.project_topics t where t.id=p_topic_id for update;
  if max_students is null then raise exception 'Topic not found'; end if;
  select department, max_students into lecturer_department, lecturer_capacity from public.lecturers where id=p_lecturer_id;
  if lecturer_capacity is null then raise exception 'Lecturer not found'; end if;
  if lower(coalesce(topic_department,'')) <> lower(coalesce(lecturer_department,'')) then raise exception 'Topic and lecturer departments do not match'; end if;
  select count(*) into open_count from public.project_allocations where topic_id=p_topic_id and status in ('pending','active') and id <> coalesce(existing_allocation.id, '00000000-0000-0000-0000-000000000000'::uuid);
  if open_count >= max_students then raise exception 'Topic is already full'; end if;
  select count(*) into lecturer_load from public.project_allocations where lecturer_id=p_lecturer_id and status in ('pending','active') and id <> coalesce(existing_allocation.id, '00000000-0000-0000-0000-000000000000'::uuid);
  if lecturer_load >= lecturer_capacity then raise exception 'Lecturer has reached supervision capacity'; end if;
  select public.get_active_academic_session() into session_id;
  if existing_allocation.id is not null then
    update public.project_allocations set topic_id=p_topic_id, lecturer_id=p_lecturer_id, status='active', academic_session_id=coalesce(existing_allocation.academic_session_id,session_id) where id=existing_allocation.id returning id into allocation_id;
  else
    insert into public.project_allocations(student_id, topic_id, lecturer_id, status, academic_session_id) values(p_student_id,p_topic_id,p_lecturer_id,'active',session_id) returning id into allocation_id;
  end if;
  update public.project_topics set lecturer_id=p_lecturer_id,status=case when open_count+1 >= max_students then 'full' else 'available' end,updated_at=now() where id=p_topic_id;
  perform public.notify_user((select user_id from public.students where id=p_student_id),'Supervisor allocated','A supervisor has been allocated to your project.','supervisor_assigned',allocation_id);
  perform public.notify_user((select user_id from public.lecturers where id=p_lecturer_id),'New project allocation','A new student has been assigned to you for supervision.','student_allocated',allocation_id);
  perform public.write_audit_log('allocate_project','project_allocations',allocation_id,'Administrator allocated or confirmed a project supervisor',jsonb_build_object('student_id',p_student_id,'topic_id',p_topic_id,'lecturer_id',p_lecturer_id));
  return allocation_id;
end;
$$;
grant execute on function public.allocate_project(uuid,uuid,uuid) to authenticated;

-- Cancel an allocation and release the topic capacity.
create or replace function public.cancel_allocation(p_allocation_id uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare allocation_record public.project_allocations%rowtype; open_count integer;
begin
  if public.current_user_role() <> 'admin' then raise exception 'Administrator access required'; end if;
  select * into allocation_record from public.project_allocations where id = p_allocation_id for update;
  if allocation_record.id is null then raise exception 'Allocation not found'; end if;
  update public.project_allocations set status = 'cancelled' where id = p_allocation_id;
  select count(*) into open_count from public.project_allocations where topic_id = allocation_record.topic_id and status in ('pending','active');
  update public.project_topics set status = case when open_count < max_students then 'available' else 'full' end, updated_at = now() where id = allocation_record.topic_id and status <> 'archived';
  perform public.notify_user((select user_id from public.students where id = allocation_record.student_id), 'Project allocation cancelled', 'Your project allocation has been cancelled by an administrator.', 'allocation_cancelled', p_allocation_id);
  perform public.notify_user((select user_id from public.lecturers where id = allocation_record.lecturer_id), 'Project allocation cancelled', 'A project allocation assigned to you has been cancelled.', 'allocation_cancelled', p_allocation_id);
  perform public.write_audit_log('cancel_allocation','project_allocations',p_allocation_id,'Administrator cancelled a project allocation');
  return p_allocation_id;
end;
$$;
grant execute on function public.cancel_allocation(uuid) to authenticated;

-- Student submission creation enforces that the student actually owns an open project.
create or replace function public.create_submission(p_title text, p_chapter text default null, p_description text default null, p_file_path text default null)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare student_id uuid; submission_id uuid; lecturer_user_id uuid;
begin
  if public.current_user_role() <> 'student' then raise exception 'Student access required'; end if;
  select id into student_id from public.students where user_id = auth.uid();
  if student_id is null then raise exception 'Student profile not found'; end if;
  if not exists(select 1 from public.project_allocations where a.student_id = student_id and a.status in ('pending','active')) then raise exception 'You must have an allocated project before submitting work'; end if;
  insert into public.submissions(student_id,title,chapter,description,file_path,status,version,updated_at)
  values(student_id,trim(p_title),nullif(trim(p_chapter),''),nullif(trim(p_description),''),p_file_path,'pending',
    coalesce((select max(s.version)+1 from public.submissions s where s.student_id = student_id),1),now()) returning id into submission_id;
  select l.user_id into lecturer_user_id from public.lecturers l join public.project_allocations a on a.lecturer_id=l.id where a.student_id=student_id and a.status in ('pending','active') limit 1;
  perform public.notify_user(lecturer_user_id,'New project submission','A student has submitted project work for your review.','submission_received',submission_id);
  return submission_id;
end;
$$;
grant execute on function public.create_submission(text,text,text,text) to authenticated;

-- Review submission, persist history, and notify the student.
create or replace function public.review_submission(p_submission_id uuid, p_lecturer_id uuid, p_status text, p_comment text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare feedback_id uuid; student_user_id uuid; submission_title text;
begin
  if public.current_user_role() <> 'lecturer' then raise exception 'Lecturer access required'; end if;
  if p_status not in ('approved','rejected','revision_required') then raise exception 'Invalid status'; end if;
  if length(trim(coalesce(p_comment,''))) < 2 then raise exception 'Feedback comment is required'; end if;
  select s.student_id, s.title into student_user_id, submission_title from public.submissions s join public.project_allocations a on a.student_id=s.student_id where s.id=p_submission_id and a.lecturer_id=p_lecturer_id and a.status in ('pending','active') limit 1;
  if student_user_id is null then raise exception 'Submission is not assigned to this lecturer'; end if;
  update public.submissions set status=p_status, reviewed_at=now(), reviewed_by=p_lecturer_id, updated_at=now() where id=p_submission_id;
  insert into public.feedback(submission_id,lecturer_id,comment) values(p_submission_id,p_lecturer_id,trim(p_comment)) returning id into feedback_id;
  insert into public.submission_reviews(submission_id,lecturer_id,status,comment) values(p_submission_id,p_lecturer_id,p_status,trim(p_comment));
  perform public.notify_user((select user_id from public.students where id=student_user_id),'Submission reviewed','Your submission "'||submission_title||'" has been marked '||replace(p_status,'_',' ')||'.','submission_reviewed',p_submission_id);
  perform public.write_audit_log('review_submission','submissions',p_submission_id,'Lecturer reviewed a submission',jsonb_build_object('status',p_status));
  return feedback_id;
end;
$$;
grant execute on function public.review_submission(uuid,uuid,text,text) to authenticated;

-- Admin approval/assignment for student-proposed topics or lecturer topics.
create or replace function public.approve_topic_and_assign_lecturer(p_topic_id uuid, p_lecturer_id uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare topic_record public.project_topics%rowtype;
begin
  if public.current_user_role() <> 'admin' then raise exception 'Administrator access required'; end if;
  select * into topic_record from public.project_topics where id=p_topic_id for update;
  if topic_record.id is null then raise exception 'Topic not found'; end if;
  if not exists(select 1 from public.lecturers where id=p_lecturer_id) then raise exception 'Lecturer not found'; end if;
  update public.project_topics set lecturer_id=p_lecturer_id,status='available',updated_at=now() where id=p_topic_id;
  if topic_record.proposed_by is not null then
    perform public.notify_user((select user_id from public.students where id=topic_record.proposed_by),'Topic approved','Your proposed project topic has been approved and assigned to a supervisor.','topic_approved',p_topic_id);
  else
    perform public.notify_user((select user_id from public.lecturers where id=p_lecturer_id),'Topic approved','Your project topic has been approved and is now available.','topic_approved',p_topic_id);
  end if;
  perform public.write_audit_log('approve_topic','project_topics',p_topic_id,'Administrator approved a topic and assigned a lecturer',jsonb_build_object('lecturer_id',p_lecturer_id));
  return p_topic_id;
end;
$$;
grant execute on function public.approve_topic_and_assign_lecturer(uuid,uuid) to authenticated;

create or replace function public.reject_topic(p_topic_id uuid, p_reason text default null)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare topic_record public.project_topics%rowtype;
begin
  if public.current_user_role() <> 'admin' then raise exception 'Administrator access required'; end if;
  select * into topic_record from public.project_topics where id=p_topic_id for update;
  if topic_record.id is null then raise exception 'Topic not found'; end if;
  update public.project_topics set status='rejected',updated_at=now() where id=p_topic_id;
  if topic_record.proposed_by is not null then
    perform public.notify_user((select user_id from public.students where id=topic_record.proposed_by),'Topic rejected',coalesce(nullif(trim(p_reason),''),'Your proposed project topic was not approved.'),'topic_rejected',p_topic_id);
  elsif topic_record.lecturer_id is not null then
    perform public.notify_user((select user_id from public.lecturers where id=topic_record.lecturer_id),'Topic rejected',coalesce(nullif(trim(p_reason),''),'Your project topic was not approved.'),'topic_rejected',p_topic_id);
  end if;
  perform public.write_audit_log('reject_topic','project_topics',p_topic_id,'Administrator rejected a topic',jsonb_build_object('reason',p_reason));
  return p_topic_id;
end;
$$;
grant execute on function public.reject_topic(uuid,text) to authenticated;

-- Notification triggers for messages and topic-selection requests.
create or replace function public.on_message_created()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.notify_user(new.receiver_id,'New message','You have received a new message.','new_message',new.id);
  return new;
end; $$;

drop trigger if exists trg_message_notification on public.messages;
create trigger trg_message_notification after insert on public.messages for each row execute function public.on_message_created();

create or replace function public.on_allocation_created()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.notify_user((select user_id from public.students where id=new.student_id),'Project allocation updated','Your project allocation has been updated.','allocation_updated',new.id);
  return new;
end; $$;

-- Enable RLS on new tables.
alter table public.academic_sessions enable row level security;
alter table public.audit_logs enable row level security;
alter table public.submission_reviews enable row level security;

drop policy if exists academic_sessions_select on public.academic_sessions;
create policy academic_sessions_select on public.academic_sessions for select to authenticated using (true);
drop policy if exists academic_sessions_admin on public.academic_sessions;
create policy academic_sessions_admin on public.academic_sessions for all to authenticated using (public.current_user_role()='admin') with check (public.current_user_role()='admin');

drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs for select to authenticated using (public.current_user_role()='admin');

drop policy if exists submission_reviews_select on public.submission_reviews;
create policy submission_reviews_select on public.submission_reviews for select to authenticated using (
  lecturer_id in (select id from public.lecturers where user_id=auth.uid())
  or submission_id in (select id from public.submissions where student_id in (select id from public.students where user_id=auth.uid()))
  or public.current_user_role()='admin'
);

drop policy if exists notifications_insert_system on public.notifications;
create policy notifications_insert_system on public.notifications for insert to authenticated with check (user_id = auth.uid() or public.current_user_role()='admin');

-- Protect direct submission creation and direct allocation cancellation behind RLS/RPC workflows.
drop policy if exists submissions_insert_own on public.submissions;
create policy submissions_insert_own on public.submissions for insert to authenticated with check (
  student_id in (select id from public.students where user_id=auth.uid())
  and exists(select 1 from public.project_allocations a where a.student_id=public.submissions.student_id and a.status in ('pending','active'))
);

drop policy if exists allocations_update_admin on public.project_allocations;
create policy allocations_update_admin on public.project_allocations for update to authenticated using (public.current_user_role()='admin') with check (public.current_user_role()='admin');

-- Useful automatic updated_at trigger.
create or replace function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end; $$;

drop trigger if exists trg_profiles_updated_at on public.profiles; create trigger trg_profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists trg_students_updated_at on public.students; create trigger trg_students_updated_at before update on public.students for each row execute function public.set_updated_at();
drop trigger if exists trg_lecturers_updated_at on public.lecturers; create trigger trg_lecturers_updated_at before update on public.lecturers for each row execute function public.set_updated_at();
drop trigger if exists trg_topics_updated_at on public.project_topics; create trigger trg_topics_updated_at before update on public.project_topics for each row execute function public.set_updated_at();
drop trigger if exists trg_progress_updated_at on public.project_progress; create trigger trg_progress_updated_at before update on public.project_progress for each row execute function public.set_updated_at();
drop trigger if exists trg_submissions_updated_at on public.submissions; create trigger trg_submissions_updated_at before update on public.submissions for each row execute function public.set_updated_at();
