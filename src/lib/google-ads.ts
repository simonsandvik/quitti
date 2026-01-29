"use server";

export interface GoogleAdsCustomer {
    resourceName: string;
    id: string;
    descriptiveName?: string;
    currencyCode?: string;
    timeZone?: string;
}

export interface GoogleAdsInvoice {
    resourceName: string; // customers/{customerId}/invoices/{invoiceId}
    id: string; // The ID of the invoice
    type: string; // e.g. INVOICE, ACCOUNT_BUDGET
    billingSetup: string; // Resource name of billing setup
    paymentsAccountId: string;
    paymentsProfileId: string;
    issueDate: string; // YYYY-MM-DD
    dueDate: string; // YYYY-MM-DD
    serviceDateRange: {
        startDate: string; // YYYY-MM-DD
        endDate: string; // YYYY-MM-DD
    };
    pdfUrl: string; // URL to download PDF
    subtotalAmountMicros: string; // string (int64)
    taxAmountMicros: string; // string (int64)
    totalAmountMicros: string; // string (int64)
    currencyCode: string; // ISO 4217
}

const API_VERSION = "v17";

/**
 * Lists all customers accessible by the user's OAuth token.
 * Note: This endpoint (customers:listAccessibleCustomers) returns a list of *customer resource names* requestable by the user.
 * It does NOT return details like descriptiveName directly, but we can try to fetch them or just return IDs.
 */
export async function listAccessibleCustomers(accessToken: string, developerToken: string): Promise<string[]> {
    const url = `https://googleads.googleapis.com/${API_VERSION}/customers:listAccessibleCustomers`;

    const response = await fetch(url, {
        method: 'GET',
        headers: {
            "Authorization": `Bearer ${accessToken}`,
            "developer-token": developerToken,
            "Content-Type": "application/json"
        }
    });

    if (!response.ok) {
        console.error("Failed to list accessible customers", await response.text());
        // Return empty instead of throwing to avoid crashing the client loop
        return [];
    }

    const data = await response.json();
    // data.resourceNames is an array of strings like "customers/1234567890"
    return data.resourceNames || [];
}

/**
 * List Invoices for a specific customer.
 * 
 * @param accessToken OAuth access token
 * @param developerToken Google Ads Developer Token
 * @param customerId The 10-digit customer ID (e.g. "1234567890")
 * @param billingSetup Optional billing setup resource name filter
 * @param issueYear Year to fetch (e.g. "2024")
 * @param issueMonth Month to fetch (e.g. "JANUARY")
 */
export async function listInvoices(
    accessToken: string,
    developerToken: string,
    customerId: string,
    loginCustomerId?: string, // Optional: if acting as a manager
    query?: {
        billingSetup?: string;
        issueYear: string;
        issueMonth: string;
    }
): Promise<GoogleAdsInvoice[]> {
    // If we only have "customers/1234567890", strip strictly to digits
    const cleanId = customerId.replace(/[^0-9]/g, "");

    // Construct URL with query params
    const baseUrl = `https://googleads.googleapis.com/${API_VERSION}/customers/${cleanId}/invoices`;
    const params = new URLSearchParams();
    if (query?.billingSetup) params.append("billingSetup", query.billingSetup);
    params.append("issueYear", query?.issueYear || new Date().getFullYear().toString());
    // Default to current month if not specified? Or required?
    // API requires issueMonth. We might need to guess or ask user. 
    // Let's default to a known enum if missing, or require it. 
    // For now, let's assume the caller provides it or we default to a check.
    if (query?.issueMonth) params.append("issueMonth", query.issueMonth);

    const url = `${baseUrl}?${params.toString()}`;

    const headers: Record<string, string> = {
        "Authorization": `Bearer ${accessToken}`,
        "developer-token": developerToken,
        "Content-Type": "application/json"
    };

    if (loginCustomerId) {
        headers["login-customer-id"] = loginCustomerId;
    }

    const response = await fetch(url, {
        method: 'GET',
        headers
    });

    if (!response.ok) {
        // 403 or 400 usually indicates invalid customer or no invoices
        const errorText = await response.text();
        console.warn(`Failed to list invoices for ${cleanId}: ${errorText}`);
        return [];
    }

    const data = await response.json();
    // data.invoices is the array
    const invoices: any[] = data.invoices || [];

    return invoices.map(inv => ({
        resourceName: inv.resourceName,
        id: inv.id,
        type: inv.type,
        billingSetup: inv.billingSetup,
        paymentsAccountId: inv.paymentsAccountId,
        paymentsProfileId: inv.paymentsProfileId,
        issueDate: inv.issueDate, // "2024-01-02"
        dueDate: inv.dueDate,
        serviceDateRange: {
            startDate: inv.serviceDateRange?.startDate,
            endDate: inv.serviceDateRange?.endDate
        },
        pdfUrl: inv.pdfUrl,
        subtotalAmountMicros: inv.subtotalAmountMicros,
        taxAmountMicros: inv.taxAmountMicros,
        totalAmountMicros: inv.totalAmountMicros,
        currencyCode: inv.currencyCode
    }));
}

/**
 * Downloads a PDF from a given URL proxying through the server to avoid CORS.
 * Returns Base64 string of the PDF content.
 */
export async function downloadInvoicePdf(url: string, accessToken: string): Promise<string | null> {
    try {
        const response = await fetch(url, {
            headers: {
                "Authorization": `Bearer ${accessToken}`
            }
        });

        if (!response.ok) {
            console.error(`Failed to download PDF from ${url}: ${response.statusText}`);
            return null;
        }

        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer).toString('base64');
    } catch (e) {
        console.error("Server Code: Failed to download PDF", e);
        return null;
    }
}
