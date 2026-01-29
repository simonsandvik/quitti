# Microsoft (Outlook) OAuth Setup Guide

To enable Outlook integration, you need to create an App Registration in Azure.

## 1. Create App Registration
1.  Go to [Azure Portal](https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade).
2.  Click **New registration**.
3.  **Name**: `Quitti`
4.  **Supported account types**:
    *   Select **"Accounts in any organizational directory (Any Microsoft Entra ID tenant - Multitenant) and personal Microsoft accounts (e.g. Skype, Xbox)"**.
    *   *(This is critical for personal Outlook/Hotmail)*.
5.  **Redirect URI**:
    *   Select **Web**.
    *   Enter: `http://localhost:3000/api/auth/callback/azure-ad`
6.  Click **Register**.

## 2. Generate Secrets
1.  Go to **Certificates & secrets** (in the sidebar).
2.  Click **New client secret**.
3.  Description: `Dev Secret`. Expires: `6 months`. Add.
4.  **COPY THE VALUE IMMEDIATELY**. You won't see it again. this is your `AZURE_AD_CLIENT_SECRET`.

## 3. Get IDs
1.  Go to **Overview** (sidebar).
2.  Copy **Application (client) ID**. This is your `AZURE_AD_CLIENT_ID`.
3.  Note that `AZURE_AD_TENANT_ID` is usually `common` for multi-tenant apps.

## 4. API Permissions (Optional but good check)
1.  Go to **API Permissions**.
2.  Ensure `User.Read` is present.
3.  Click **Add a permission** -> **Microsoft Graph** -> **Delegated permissions**.
4.  Search for and add: `Mail.Read`.
5.  Click **Add permissions**.

## 5. Update .env.local
Open your `.env.local` file and add:

```env
AZURE_AD_CLIENT_ID=paste_client_id_here
AZURE_AD_CLIENT_SECRET=paste_secret_value_here
AZURE_AD_TENANT_ID=common
```
