# Supabase setup for University Project Portal

## 1. Create project
Create a Supabase project, then copy the Project URL and Publishable Key.

## 2. Configure local environment
Copy `.env.example` to `.env.local` and fill in:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_KEY
```

Never put a service-role/secret key in the React app.

## 3. Install dependencies

```bash
pnpm install
```

## 4. Provision the database
Open Supabase -> SQL Editor -> New query. Paste the entire `supabase/schema.sql` and run it once.

The SQL creates:
- profiles
- students
- lecturers
- project_topics
- project_allocations
- project_progress
- submissions
- feedback
- messages
- notifications
- indexes
- authentication trigger
- RPC functions
- RLS policies
- private project document storage

## 5. Configure Auth
Open Authentication -> Providers -> Email and enable Email.

For initial development, you may disable email confirmation. For production, keep email confirmation enabled and configure your university email/domain policies as required.

## 6. Create the first administrator
Public registration intentionally supports only students and lecturers. Create an admin account with normal email/password signup, then promote it from SQL Editor:

```sql
update public.profiles
set role = 'admin'
where email = 'YOUR_ADMIN_EMAIL';
```

Only do this for your real administrator account.

## 7. Start the frontend

```bash
pnpm dev
```

## 8. Test
1. Register a student.
2. Register a lecturer.
3. Promote one account to admin.
4. Log in again.
5. Create topics as lecturer.
6. Request a topic as student.
7. Allocate the project as admin.
8. Update progress as student.
9. Submit a document.
10. Review it as lecturer.
11. Test messaging.

## 9. Netlify
In Netlify add the same two environment variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Build command: `pnpm build`
Publish directory: `dist`

## Important security notes
- Never expose a service-role/secret key in Vite variables.
- Do not allow public admin registration.
- Keep `project-documents` private.
- RLS is part of the security boundary; do not disable it just to make a query work.

## Backend hardening added
The latest schema also adds academic-session support, audit logging, submission review history, automatic notifications, server-side allocation capacity checks, protected submission creation, topic approval/assignment and cancellation RPCs, and automatic `updated_at` timestamps.

After updating the project, run the complete `supabase/schema.sql` again in the Supabase SQL Editor. The script uses `if not exists`/`drop ... if exists` patterns for the additions so it can be applied to the existing project.

Recommended first test flow:
1. Register a student and a lecturer.
2. Promote one account to admin in `profiles`.
3. Create/approve a lecturer topic and assign a lecturer.
4. Select the topic as a student.
5. Upload a submission.
6. Review it as the lecturer.
7. Confirm notifications and review history appear.
8. Test cancellation/reallocation from the admin account.
