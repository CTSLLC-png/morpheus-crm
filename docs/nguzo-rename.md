# Morpheus OS → Nguzo OS (brand rename)

This change renames the **brand text** only. Users see "Nguzo OS" (or
"Nguzo" in running copy) everywhere the app used to say Morpheus, Morpheus
OS, Morpheus CRM, MorpheusOS or MorpheusCR.

## What changed

Text inside existing files. No files or folders were moved, renamed or
deleted, so every import and path still resolves.

| Old | New |
|---|---|
| Morpheus Operating System, Morpheus OS, Morpheus CRM, MorpheusOS, MorpheusCR | Nguzo OS |
| Morpheus (running copy, e.g. "Sign in to Morpheus") | Nguzo |
| MORPHEUS CRM / MORPHEUS / MORPHEUS.EDU (PDF headers, kickers) | NGUZO OS / NGUZO / NGUZO.EDU |
| `Morpheus_Certificate_…`, `Morpheus_Report_…` download names | `Nguzo_Certificate_…`, `Nguzo_Report_…` |

Visible surfaces covered: page title and meta tags in `index.html`, the
in-app `document.title`, the public home page, sign-in and reset screens,
the trainer and participant shells, admin panel, PDF certificates and
reports, the privacy page, error messages from `api/claude.js`, and docs.

## Intentionally unchanged

Renaming these would break deploys, data, or signed-in sessions and buys
nothing a user can see. Change them only in a separate, planned migration.

- **Domains:** `morpheuscr.com`, `www.morpheuscr.com`, `legacy.morpheuscr.com`
  and the `@morpheuscr.com` addresses. Keep the domain renewed. When a Nguzo
  domain is registered, add it in Vercel and 301-redirect `morpheuscr.com`.
- **Database and edge function names:** the Supabase project, tables,
  functions, RPCs and edge function names (for example `on-user-signup`).
- **Applied migrations and SQL files:** every `*.sql` file is untouched,
  including `sql/`, `supabase/migrations/`, `morpheus_schema_v1.sql` and
  the SQL tests. Editing an applied migration makes the repo disagree with
  production.
- **CSS classes:** `.morpheus-app`, `.morpheus-sidebar`, `.morpheus-main`,
  `.morpheus-topbar` and friends.
- **The `morpheus.tenant` localStorage key** in `src/hooks/useTenant.jsx`.
  Changing it would silently reset every user's selected tenant.
- **File, module and identifier names:** the repo name `morpheus-crm`,
  `src/lib/morpheus.js`, `morpheus_onboarding.py`, the Vercel project name
  and code identifiers.

## Before public launch

- Run a trademark knockout search on "Nguzo", "Nguzo OS", "Nguzo Field"
  and "Nguzo Care".
- Update assets outside this repo: favicon/logo images, Supabase Auth email
  templates, and any Stripe or statement descriptors.
