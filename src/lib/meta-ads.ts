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
    const url = `https://graph.facebook.com/${API_VERSION}/me/adaccounts?fields=id,account_id,name,currency,business&limit=1000`;

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
        currency: acc.currency,
        business: acc.business
    }));
}

/**
 * List Invoices for a specific Business ID (if available).
 * Meta Ads invoices are often attached to the Business Manager.
 * For individual ad accounts, we might need to check 'transactions' or 'invoices' if enabled.
 */
export async function listBusinessInvoices(accessToken: string, businessId: string, fromDate?: string): Promise<MetaInvoice[]> {
    let url = `https://graph.facebook.com/${API_VERSION}/${businessId}/business_invoices?fields=id,invoice_id,issue_date,total_amount,download_uri,status`;

    if (fromDate) {
        url += `&from_date=${fromDate}`;
    }

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
export async function listAdAccountTransactions(accessToken: string, adAccountId: string, since?: number, limit: number = 200): Promise<any[]> {
    let url = `https://graph.facebook.com/${API_VERSION}/${adAccountId}/transactions?fields=id,time,amount,billing_reason,invoice_id&limit=${limit}`;

    if (since) {
        url += `&since=${since}`;
    }

    const response = await fetch(url, {
        headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json"
        }
    });

    if (!response.ok) {
        const errText = await response.text();
        console.error(`[Meta API Error] ${response.status} ${response.statusText} - ${url}`, errText);
        return [];
    }

    const data = await response.json();
    console.log(`[Meta API Success] Fetched ${data.data?.length} records from ${url}`);
    // TODO: Handle clean pagination if > limit, but 200-500 is usually enough for monthly checks
    return data.data || [];
}

export interface MetaBillingActivity {
    id: string;
    event_time: string;
    event_type: string;
    extra_data?: {
        amount?: string;
        currency?: string;
        billing_event?: string;
    };
    translated_event_type?: string;
}

/**
 * List Ad Account Billing Activities (credit card charges).
 * This is the correct endpoint for prepay/credit card charges.
 */
export async function listAdAccountBillingActivities(accessToken: string, adAccountId: string, since?: number): Promise<MetaBillingActivity[]> {
    // Request ALL available fields to find where the amount is stored
    let url = `https://graph.facebook.com/${API_VERSION}/${adAccountId}/activities?fields=event_time,event_type,extra_data,translated_event_type,actor_name,object_name,object_type&event_type=ad_account_billing_charge&limit=500`;

    if (since) {
        url += `&since=${since}`;
    }

    console.log(`[Meta] Fetching billing activities from: ${url}`);

    const response = await fetch(url, {
        headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json"
        }
    });

    if (!response.ok) {
        const errText = await response.text();
        console.error(`[Meta Billing Activities Error] ${response.status} ${response.statusText}`, errText);
        return [];
    }

    const data = await response.json();
    console.log(`[Meta] Found ${data.data?.length || 0} billing activities`);

    // Debug: Log first activity to see structure
    if (data.data?.length > 0) {
        console.log(`[Meta Debug] First Billing Activity (full):`, JSON.stringify(data.data[0], null, 2));
    }

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
