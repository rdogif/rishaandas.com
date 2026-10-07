# Set up the public homework list and private admin access

The website portion is ready at `/homework/`. Cloud syncing starts only after you complete these steps. You do not need to move your static website, install a backend, or run an npm build.

## Existing project: upgrade from 001

You already ran `001_homework.sql`. **Do not edit or rerun it.**

1. In Table Editor, confirm `homework_members` contains only your existing admin UUID. The new migration enforces a maximum of one member and safely fails if multiple members exist. Removing an extra membership does not delete assignments.
2. Open SQL Editor → New query. Paste the complete contents of `supabase/migrations/002_public_read_admin_write.sql` and click Run once. Existing assignments are preserved. All assignment fields, including notes, become public.
3. In Authentication → Sign In / Providers, keep **Allow new users to sign up OFF**, **Anonymous sign-ins OFF**, and Email ON. Keep other providers disabled. Public browsing uses the `anon` database role; it does not create anonymous Auth accounts.
4. In Authentication → Users, keep only your intended admin account active. If you previously created test/non-admin Auth users, ban those accounts to prevent their sign-in. A non-approved account still cannot write even if it has an old valid session.
5. Keep your existing URL configuration, email setup, and `homework/config.js` public values. No new key, secret, user, or backend is needed.
6. Publish the website changes with your existing static deployment process.
7. Open `/homework/` in an incognito window: assignments and filters should load immediately, with no editor or completion/edit/delete controls. Click Admin only when you want to sign in with your existing approved email. Sign out returns to the public list.

The steps below are for a **brand-new installation only**. Skip them for your existing project.

## How access and syncing work

Assignments are stored in Supabase Postgres, not localStorage. Everyone can read assignments and notes without signing in. Supabase Auth and row-level security allow only the single approved admin to create or change their assignments. Visitors cannot register or approve themselves. The discreet **Admin** link opens a separate owner-only email-link form. Hiding editing controls is a convenience; database grants and RLS enforce the write restrictions even for direct API requests.

For editing, sign in on each browser using the **same approved admin email account**. Supabase stores a renewable auth session in that browser's localStorage; this is only authentication, never the assignment database. Clearing browser storage or using private browsing requires reconnecting. Anyone using an already-connected browser can edit your tracker, so use **Sign out** on shared devices. A browser-readable session is the tradeoff for keeping the current static hosting; an HttpOnly cookie approach would require a separate server.

The page fetches cloud data on opening, returning to the tab, reconnecting to the internet, clicking Refresh, and every 15 seconds while visible. No Realtime publication is needed. Offline writes are disabled; unsaved form contents stay only in the open page, not across reloads. Edits and deletes check the previous database timestamp to detect competing changes.

## 1. Create a Supabase project

1. Open <https://supabase.com/dashboard> and create/sign into your Supabase account.
2. Create an organization if prompted, then choose **New project**.
3. Name the project **rishaandas-homework**. A free project is sufficient to start; review the displayed plan limits before choosing a plan.
4. Choose a region near you (a US region is reasonable for Chicago).
5. Generate a strong database password and save it in a password manager. It does **not** go in this repository or the website.
6. Create the project and wait for it to become ready. Use a new project for this migration, rather than a project with unrelated data.

## 2. Create the tables and access rules

1. In your new project, open **SQL Editor → New query**.
2. Open `supabase/migrations/001_homework.sql` from this repository.
3. Copy the **entire file**, paste it into the SQL Editor, and click **Run** once.
4. Then run the entire `supabase/migrations/002_public_read_admin_write.sql` file in a new query. Confirm both finish successfully. In **Table Editor**, you should see `homework_members` and `homework_assignments`, both with RLS enabled.
5. Keep the policies from the migrations and do not disable RLS. The migration is transactional and intended to run once; if it says a table already exists, inspect the previous run instead of deleting tables or repeatedly running it.

## 3. Create your account and approve it

1. Open **Authentication → Users → Add user → Create new user**.
2. Enter the email you want to use on **all** your devices. For initial testing without custom SMTP, use the same email as your Supabase organization/team account (see step 5).
3. Enter a generated strong password and enable **Auto Confirm User**. Store the password in a password manager; the tracker uses email links so you will not enter that password on the site.
4. Create the user and copy its **User UID** (UUID).
5. In **SQL Editor → New query**, paste this, replacing `YOUR-USER-UUID` with that UUID, then click **Run**:

   ```sql
   insert into public.homework_members (user_id)
   values ('YOUR-USER-UUID'::uuid)
   on conflict (user_id) do nothing;
   ```

6. In **Authentication → Sign In / Providers**, turn **Allow new users to sign up** off. Keep Email enabled. Keep anonymous sign-ins off. Other sign-in providers are unnecessary.
7. Leave `homework_members` with just your account. Even if someone finds the connection page or public project key, they cannot add themselves to this table. The UUID is an identifier, not a password; you do not need to put it in client configuration.

## 4. Configure the website callback address

1. Open **Authentication → URL Configuration**.
2. Set **Site URL** to `https://rishaandas.com/homework/`.
3. Add this exact **Redirect URL**: `https://rishaandas.com/homework/`.
4. For local testing, also add `http://localhost:8000/homework/`.
5. Save. Use the canonical `rishaandas.com` address consistently on each device; `www` and non-`www` have separate browser sessions. If you deliberately serve both without a redirect, also allow `https://www.rishaandas.com/homework/`.
6. In **Authentication → Email Templates → Magic Link**, keep the standard link that uses `{{ .ConfirmationURL }}`. Do not replace it with a direct link to the homepage or a custom server callback; this static client lets the Supabase SDK process the returned authorization code using PKCE.

## 5. Configure email delivery

For an initial test, Supabase's built-in mail service sends only to addresses on your Supabase organization team. Use that exact email for the account created in step 3. The built-in service currently allows only **two emails per hour**, so connecting three devices may require waiting for the rate limit to reset. Check current limits in your dashboard.

For reliable everyday use, enable custom SMTP:

1. Choose an email delivery provider with SMTP support, create its account, and verify a domain you own following that provider's DNS instructions.
2. Obtain its SMTP host, port, username, password, and a verified sender address.
3. In Supabase, open **Authentication → Email → SMTP Settings** (or the **SMTP Settings** tab within Authentication), and enable custom SMTP.
4. Enter sender name `Homework Tracker`, your verified sender address, and the provider's exact host, port, username, and password. Save.
5. Keep these credentials **only in Supabase's SMTP settings** and your password manager. Do not put them in Git, JavaScript, or `config.js`.
6. Check **Authentication → Rate Limits** and the provider's delivery logs if sending fails. Disable email link tracking in your mail provider if it rewrites authentication URLs.

See [Supabase's email delivery instructions](https://supabase.com/docs/guides/auth/auth-smtp) for its supported settings and current restrictions.

## 6. Put only the public values in the website

1. In your project's **Connect** dialog or **Project Settings → Data API**, copy the **Project URL**, such as `https://abcdefghijk.supabase.co` (no trailing slash).
2. In **Project Settings → API Keys**, find the **Publishable key** beginning with `sb_publishable_`. Create a publishable key if none exists.
3. Open `homework/config.js` and fill in the two empty strings:

   ```js
   export const config = {
     url: 'https://YOUR-PROJECT-REF.supabase.co',
     publishableKey: 'sb_publishable_YOUR-PUBLIC-KEY',
   };
   ```

4. These **two values are public by design** and may be committed/deployed. Database access is protected by authentication, table grants, and RLS, not by hiding the publishable key. This client intentionally accepts only the newer publishable key format.
5. Never copy a key beginning with `sb_secret_`, a legacy `service_role` key, the database password, JWT signing secret, SMTP credentials, or an access/refresh token into this project. No private server key is needed.

## 7. Test locally and deploy with your existing website

1. In a terminal at the repository root, run:

   ```sh
   python -m http.server 8000 --bind 127.0.0.1
   ```

2. Visit `http://localhost:8000/homework/`. Do not open the HTML as a `file://` URL.
3. Click **Admin**, enter the email from step 3, and send the link.
4. Open the email link **in the same browser on the same device that requested it**. For example, if you requested it in Safari, do not let the email app open it in an isolated in-app browser. Request a fresh link if it expired, was already used, or opened in the wrong browser. PKCE ties it to the requesting browser.
5. Add `AP Physics 1` / `Page 42` with a due date. Confirm the “Saved to the cloud” message and check `homework_assignments` in Supabase's Table Editor.
6. Deploy the changes through the site's existing GitHub Pages/static publishing process. Commit only the intended website, SQL, docs, and tests; inspect `git diff` first. No build command or server hosting change is required. This implementation does not itself publish your changes.
7. Open `https://rishaandas.com/homework/` and connect the production browser separately. A localhost session is not shared with the production domain.

## 8. Verify public reads, admin writes, and syncing

1. On your iPad, visit `https://rishaandas.com/homework/`, connect with your approved email, and add `AP Physics 1 — Page 42`.
2. On your phone or computer, visit the same URL without signing in. The assignment should appear on load, on Refresh, or within 15 seconds while the page is visible.
3. Click Admin on the phone and sign in with the same approved email, then edit its notes. Refresh on the iPad and confirm the update.
4. Mark it complete. Check the Completed filter on the other device, then uncheck it.
5. Check Today (unfinished and due today), Upcoming (unfinished and due after today), Overdue, and class filters. All includes completed work after unfinished work. Dates use each device's local calendar date, so keep device time zones correct.
6. Open Edit on both devices. Save on one, then try saving the old form on the other. It should report a conflict instead of overwriting. Cancel/reopen Edit to load the latest version and reapply the desired change.
7. Delete a test assignment, confirm, and check it disappears on the other device.
8. Visit the tracker in a private/incognito window without connecting. You should see all assignments and notes, but no editing controls. Public-key access permits reads only.
9. Sign out on a shared device. Reload and confirm assignments are still shown but editing controls are gone. Sign-out affects this browser, not your other devices.

## Troubleshooting and maintenance

- **Cloud setup is not finished:** check the two strings in `homework/config.js`. Use the publishable key, not a legacy key.
- **Email not received:** check spam, team email eligibility, SMTP settings, and rate limits. Wait at least a minute between requests. A mail scanner may consume a one-use link; request a fresh link and open it promptly.
- **Link opens the wrong address:** check Site URL, exact Redirect URLs, and the Magic Link template. Local requests redirect to localhost; request production links from the production site.
- **Account not approved:** confirm the Auth user's UUID is in `homework_members`. Reload after fixing it. Do not weaken policies.
- **Cloud unavailable:** check internet access and whether the project is paused. Also ensure the school network permits the Supabase project, `esm.sh` (pinned SDK), and email access. Google Fonts is optional; the page falls back to system fonts.
- **Save could not be confirmed:** form input remains visible. Refresh and inspect the list before retrying: a request can succeed in the cloud while its response is lost. There is no offline write queue.
- **Conflict:** another device changed/deleted the row. Copy any draft you need, cancel, and reopen the current version.
- **Revoke a device/account:** disconnect on the device; if it is lost, revoke its sessions through Supabase Auth. For immediate database denial to the account, remove its row from `homework_members`; this preserves public assignments and blocks writes until you reapprove the same UUID. Deleting the Auth user itself deletes that user's assignments, so export/backup before deleting an account.
- **Backups:** Supabase is the source of truth. Arrange backups/exports appropriate to your plan. Browser storage is not a backup.

## Developer checks

Node is needed only for tests, not to deploy the site:

```sh
npm ci
npx playwright install chromium
npm test
npm run test:browser
```

The SQL tests run both real migrations against an embedded PostgreSQL engine with Supabase-style Auth roles. Browser tests use a simulated Supabase service to exercise UI behavior and multiple browser contexts. Neither substitutes for step 8 against your actual hosted project and email settings.

References: [Supabase passwordless authentication](https://supabase.com/docs/guides/auth/auth-email-passwordless), [PKCE flow](https://supabase.com/docs/guides/auth/sessions/pkce-flow), [row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security), [public and secret API keys](https://supabase.com/docs/guides/api/api-keys).
