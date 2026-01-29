# Quitti | Automated Receipt Finder

Quit chasing receipts. Quitti automatically finds, matches, and exports your missing bookkeeping documents from your email inboxes and ad accounts.

## Core Features

- **Multi-Account Integration**: Connect Gmail, Outlook, Google Ads, and Meta Ads.
- **Smart Matching**: Automatically matches your bookkeeping list (CSV/Excel) against emails and transactions.
- **Automated Downloads**: Securely proxies and downloads PDF invoices directly.
- **Bulk Export**: Zip and export all found receipts in seconds.

## Setup

1. **Prerequisites**: Node.js 18+ and a Supabase/NextAuth compatible database.
2. **Environment**: Copy `.env.local.example` to `.env.local` and fill in your credentials.
3. **Install**: `npm install`
4. **Run**: `npm run dev`

## Documentation

- [Google OAuth Setup Guide](./GOOGLE_AUTH_SETUP.md)
- [Microsoft OAuth Setup Guide](./MICROSOFT_AUTH_SETUP.md)
