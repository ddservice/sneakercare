# SneakerCare — Frontend

Vite + React + TypeScript frontend for the SneakerCare shop-management system. This is the
production frontend — deployed automatically to `sneakercare.ddserviceth.com` on every push to
`main` (see `../.github/workflows/deploy.yml`). It talks directly to Supabase from the browser
using a publishable/anon key; Postgres Row Level Security is the real authorization boundary, not
anything in this codebase.

See `../CLAUDE.md` for full architecture notes, business rules, and incident history.

## Structure

```
src/
  App.tsx                 routes (each tab is lazy-loaded)
  components/             shared layout + auth guard
  lib/                     cross-cutting utilities (Supabase client, auth, theme, Excel import, payslip printing)
  lib/queries/             one file per data domain — React Query hooks wrapping Supabase calls
  pages/<Tab>.tsx          one file per top-level tab (Overview, Sales, Stock, Opex, Stats, Settings)
  pages/<tab>/<Section>.tsx  sub-components for that tab
```

## Commands

```bash
npm run dev      # dev server
npm run build     # typecheck + production build
npm test          # vitest — unit tests for business-critical calculations (payroll, cash-basis profit, Excel date parsing)
npm run lint      # oxlint
```
