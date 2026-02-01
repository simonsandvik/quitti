# Quitti - Automated Receipt Hunter 🧾

Quitti automates the tedious process of finding receipts for your bookkeeping. It securely connects to your email (Gmail/Outlook) and ad accounts (Google Ads/Meta) to find, match, and download the exact receipts corresponding to your bank transactions.

## 🚀 Features

*   **Smart Scanning**: Finds receipts in Gmail & Outlook.
*   **Ad Platform Integration**: Fetches invoices directly from Google Ads & Meta Ads APIs.
*   **Exact Matching**: Matches receipts to transactions by Date, Amount, and Merchant.
*   **Team Sharing**: Share receipt reports with your accountant or team members.
*   **Admin Dashboard**: Monitor system stats and user activity.

## 🛠️ Getting Started

### Prerequisites

*   Node.js 18+
*   Supabase Project
*   Google Cloud Console Project (for OAuth)

### Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/your-username/quitti.git
    cd quitti
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

3.  Configure Environment:
    Create a `.env.local` file with the following keys:
    ```env
    # NextAuth
    NEXTAUTH_URL=http://localhost:3000
    NEXTAUTH_SECRET=your_secret

    # Google OAuth
    GOOGLE_CLIENT_ID=...
    GOOGLE_CLIENT_SECRET=...

    # Supabase
    NEXT_PUBLIC_SUPABASE_URL=...
    NEXT_PUBLIC_SUPABASE_ANON_KEY=...
    SUPABASE_SERVICE_ROLE_KEY=...

    # Admin Access (Comma-separated emails)
    ADMIN_EMAILS=alice@admin.com,bob@admin.com
    ```

4.  Run the development server:
    ```bash
    npm run dev
    ```

## 🛡️ Admin Dashboard

The application includes a hidden Admin Dashboard for monitoring.

*   **URL**: `http://localhost:3000/admin`
*   **Access**:
    1.  You must be logged in.
    2.  Your email must be listed in the `ADMIN_EMAILS` environment variable.

## 📦 Deployment

This project is optimized for deployment on **Vercel**.

1.  Push your code to GitHub.
2.  Import the project in Vercel.
3.  Add the Environment Variables from your `.env.local`.
4.  Deploy!

## 📄 License

Proprietary Software. All rights reserved.
