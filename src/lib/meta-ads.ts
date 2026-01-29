"use server";

export interface MetaAdAccount {
    id: string;
    account_id: string;
    name: string;
    currency: string;
}

export interface MetaInvoice {
    id: string;
    invoice_id: string;
    account_id: string;
    issue_date: string; // YYYY-MM-DD
    total_amount: {
        amount: string;
        currency: string;
    };
    download_uri?: string;
    status: string;
}

const API_VERSION = "v21.0";

/**
 * Lists all ad accounts accessible by the user's OAuth token.
 */
export async function listAdAccounts(accessToken: string): Promise<MetaAdAccount[]> {
    const url = `https://graph.facebook.com/${API_VERSION}/me/adaccounts?fields=id,account_id,name,currency`;

    const response = await fetch(url, {
        headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json"
        }
    });

    if (!response.ok) {
        const error = await response.text();
        console.error("Failed to list Meta ad accounts", error);
        return [];
    }

    const data = await response.json();
    return (data.data || []).map((acc: any) => ({
        id: acc.id,
        account_id: acc.account_id,
        name: acc.name,
        currency: acc.currency
    }));
}

/**
 * List Invoices for a specific Business ID (if available).
 * Meta Ads invoices are often attached to the Business Manager.
 * For individual ad accounts, we might need to check 'transactions' or 'invoices' if enabled.
 */
export async function listBusinessInvoices(accessToken: string, businessId: string): Promise<MetaInvoice[]> {
    const url = `https://graph.facebook.com/${API_VERSION}/${businessId}/business_invoices?fields=id,invoice_id,issue_date,total_amount,download_uri,status`;

    const response = await fetch(url, {
        headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json"
        }
    });

    if (!response.ok) {
        const error = await response.text();
        console.warn(`Failed to list Meta business invoices for ${businessId}:`, error);
        return [];
    }

    const data = await response.json();
    return (data.data || []).map((inv: any) => ({
        id: inv.id,
        invoice_id: inv.invoice_id,
        account_id: businessId,
        issue_date: inv.issue_date,
        total_amount: {
            amount: inv.total_amount?.amount || "0",
            currency: inv.total_amount?.currency || "USD"
        },
        download_uri: inv.download_uri,
        status: inv.status
    }));
}

/**
 * Fallback: List transactions for an Ad Account and try to find invoice IDs.
 */
export async function listAdAccountTransactions(accessToken: string, adAccountId: string): Promise<any[]> {
    const url = `https://graph.facebook.com/${API_VERSION}/${adAccountId}/transactions?fields=id,time,amount,billing_reason,invoice_id`;

    const response = await fetch(url, {
        headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json"
        }
    });

    if (!response.ok) {
        return [];
    }

    const data = await response.json();
    return data.data || [];
}

/**
 * Proxy for downloading files from Meta.
 */
export async function downloadMetaFile(url: string, accessToken: string): Promise<string | null> {
    try {
        const response = await fetch(url, {
            headers: {
                "Authorization": `Bearer ${accessToken}`
            }
        });

        if (!response.ok) {
            console.error(`Failed to download Meta file from ${url}: ${response.statusText}`);
            return null;
        }

        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer).toString('base64');
    } catch (e) {
        console.error("Meta Proxy Download Error", e);
        return null;
    }
}
