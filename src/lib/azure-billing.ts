export interface AzureSubscription {
    subscriptionId: string;
    displayName: string;
    state: string;
}

export interface AzureInvoice {
    id: string; // Resource ID
    name: string; // Invoice ID
    type: string;
    properties: {
        invoicePeriodStartDate: string;
        invoicePeriodEndDate: string;
        billingPeriodStartDate: string;
        billingPeriodEndDate: string;
        downloadUrl?: {
            url: string;
            expiryTime: string;
        };
        formattedAmount: string; // e.g. "12.50 EUR" - inferred or manual
        grandTotal?: {
            amount: number;
            currencyCode: string;
        };
    };
}

/**
 * Fetch all subscriptions the user has access to.
 */
export async function listSubscriptions(accessToken: string): Promise<AzureSubscription[]> {
    const response = await fetch("https://management.azure.com/subscriptions?api-version=2020-01-01", {
        headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json"
        }
    });

    if (!response.ok) {
        throw new Error(`Failed to list subscriptions: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return (data.value || []).map((sub: any) => ({
        subscriptionId: sub.subscriptionId,
        displayName: sub.displayName,
        state: sub.state
    }));
}

/**
 * List Invoices for a specific subscription.
 * Note: Use 2019-10-01-preview or newer for Billing APIs.
 * This often requires the user to have "Owner", "Contributor", or "Invoice Reader" role.
 */
export async function listInvoices(accessToken: string, subscriptionId: string): Promise<AzureInvoice[]> {
    // Generate a date filter (last 12 months)
    // The API might require specific date formats or be picky.
    // Try fetching latest invoices.

    // Using the 'List' endpoint provided by 'Microsoft.Billing' provider at subscription scope
    const url = `https://management.azure.com/subscriptions/${subscriptionId}/providers/Microsoft.Billing/invoices?api-version=2020-05-01`;

    const response = await fetch(url, {
        headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json"
        }
    });

    if (response.status === 404) {
        // Provider might not be registered or subscription type doesn't support this specific API
        console.warn(`Billing provider not found for subscription ${subscriptionId}`);
        return [];
    }

    // 403 means permission denied (common)
    if (response.status === 403) {
        console.warn(`Permission denied for invoices on subscription ${subscriptionId}`);
        return [];
    }

    if (!response.ok) {
        // Don't crash, just return empty
        console.error(`Error fetching invoices for ${subscriptionId}: ${response.statusText}`);
        return [];
    }

    const data = await response.json();
    const items = data.value || [];

    // Map to our interface
    return items.map((item: any) => {
        // Try to find download URL if present (sometimes it's a separate call)
        const downloadUrl = item.properties.downloadUrl ? {
            url: item.properties.downloadUrl.url,
            expiryTime: item.properties.downloadUrl.expiryTime
        } : undefined;

        // Try to handle "amount due" if present
        const grandTotal = item.properties.amountDue || item.properties.totalAmount || item.properties.billingProfile?.amountDue;

        return {
            id: item.id,
            name: item.name,
            type: item.type,
            properties: {
                invoicePeriodStartDate: item.properties.invoicePeriodStartDate,
                invoicePeriodEndDate: item.properties.invoicePeriodEndDate,
                billingPeriodStartDate: item.properties.billingPeriodStartDate,
                billingPeriodEndDate: item.properties.billingPeriodEndDate,
                downloadUrl,
                grandTotal: grandTotal ? {
                    amount: grandTotal.value,
                    currencyCode: grandTotal.currencyCode || 'USD'
                } : undefined
            }
        };
    });
}

/**
 * If the list endpoint didn't provide a download URL (it often does not), 
 * we might need to call a specific action to get it.
 * POST https://management.azure.com/{invoiceId}/download?api-version=2020-05-01
 */
export async function getInvoiceDownloadUrl(accessToken: string, invoiceId: string): Promise<string | null> {
    const url = `https://management.azure.com/${invoiceId}/download?api-version=2020-05-01`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json"
        }
    });

    if (!response.ok) return null;

    const data = await response.json();
    return data.url || data.downloadUrl?.url || null;
}
