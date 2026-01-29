# Google OAuth Setup Guide

To enable email integration, you need to create Google Credentials.

## 1. Create a Project
1.  Go to [Google Cloud Console](https://console.cloud.google.com/).
2.  Click the project dropdown (top left) → **New Project**.
3.  Name it `Quitti` and click **Create**.

## 2. Enable Gmail API
1.  Select your new project.
2.  Go to **APIs & Services** → **Library**.
3.  Search for `Gmail API`.
4.  Click **Enable**.

## 3. Configure Consent Screen
1.  Go to **APIs & Services** → **OAuth consent screen**.
2.  Choose **External** user type -> **Create**.
3.  **App Info**:
    -   App name: `Quitti`
    -   Support email: Your email
    -   Developer contact: Your email
4.  **Scopes**: Add `.../auth/gmail.readonly`.
5.  **Test Users**: Add your own email address (important for "External" mode).

## 4. Create Credentials
1.  Go to **APIs & Services** → **Credentials**.
2.  Click **Create Credentials** → **OAuth client ID**.
3.  App type: **Web application**.
4.  Name: `Quitti Local`.
5.  **Authorized redirect URIs**:
    -   `http://localhost:3000/api/auth/callback/google`
6.  Click **Create**.

## 5. Update Environment
1.  Copy **Client ID** and **Client Secret**.
2.  Create a file named `.env.local` in this folder (`quittiapp`).
3.  Paste the following into it:
    ```env
    # NextAuth
    NEXTAUTH_URL=http://localhost:3000
    NEXTAUTH_SECRET=any_random_string_is_fine_for_dev

    # Google
    GOOGLE_CLIENT_ID=your_pasted_client_id
    GOOGLE_CLIENT_SECRET=your_pasted_client_secret
    ```
4.  **Restart the server**: Go to the terminal where `npm run dev` is running, press `Ctrl+C` to stop it, and run `npm run dev` again.
