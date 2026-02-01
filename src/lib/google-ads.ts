
const GOOGLE_ADS_API_VERSION = "v17";
const GOOGLE_ADS_API_BASE = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`;

interface GoogleAdsCustomer {
    resourceName: string;
    id: string; // 1234567890
    descriptiveName?: string;
}

interface GoogleAdsInvoice {
    id: string;
    issueDate: string; // YYYY-MM-DD
    dueDate: string;
    totalAmountMicros: string; // 1000000 = 1 unit
    currencyCode: string;
    pdfUrl?: string; // Derived or direct
    resourceName: string;
}

// Helper for headers
const getHeaders = (accessToken: string, developerToken: string, customerId?: string) => {
    const headers: Record<string, string> = {
        "Authorization": `Bearer ${accessToken}`,
        "developer-token": developerToken,
        "Content-Type": "application/json",
    };
    if (customerId) {
        headers["login-customer-id"] = customerId;
    }
    return headers;
};

export const listAccessibleCustomers = async (accessToken: string, developerToken: string): Promise<string[]> => {
    try {
        const url = `${GOOGLE_ADS_API_BASE}/customers:listAccessibleCustomers`;
        const res = await fetch(url, {
            method: "GET",
            headers: getHeaders(accessToken, developerToken)
        });

        if (!res.ok) {
            const err = await res.text();
            console.error("Google Ads listAccessibleCustomers failed", err);
            return [];
        }

        const data = await res.json();
        // resourceNames: ["customers/1234567890", ...]
        return data.resourceNames || [];
    } catch (e) {
        console.error("Error listing Google Ads customers", e);
        return [];
    }
};

export const listInvoices = async (accessToken: string, developerToken: string, customerResourceName: string): Promise<GoogleAdsInvoice[]> => {
    // customerResourceName is "customers/1234567890" -> extract ID "1234567890"
    const customerId = customerResourceName.split("/")[1];

    // NOTE: Google Ads API "Invoice" resource is tricky.
    // We often query 'invoice' resource directly if available (Account Budget/Billing setup required).
    // Query: SELECT invoice.id, invoice.issue_date, invoice.due_date, invoice.total_amount_micros, invoice.currency_code, invoice.pdf_url FROM invoice

    // Attempting query
    const query = `
        SELECT 
            invoice.id, 
            invoice.issue_date, 
            invoice.due_date, 
            invoice.total_amount_micros, 
            invoice.currency_code, 
            invoice.pdf_url 
        FROM invoice 
        WHERE invoice.issue_date >= '2023-01-01'
    `;

    try {
        const url = `${GOOGLE_ADS_API_BASE}/customers/${customerId}/googleAds:search`;
        const res = await fetch(url, {
            method: "POST",
            headers: getHeaders(accessToken, developerToken, customerId), // Important: login-customer-id might be required if acting as manager
            body: JSON.stringify({ query })
        });

        if (!res.ok) {
            // Common error: NOT_ADS_USER or permission denied.
            // Just warn and return empty.
            const err = await res.text();
            console.warn(`Google Ads search failed for ${customerId}:`, err);
            return [];
        }

        const data = await res.json();
        /*
           data.results = [
             {
               invoice: {
                 resourceName: 'customers/123/invoices/456',
                 id: '456',
                 issueDate: '2024-01-01',
                 totalAmountMicros: '1000000',
                 currencyCode: 'EUR',
                 pdfUrl: 'https://...'
               }
             }
           ]
        */

        if (!data.results) return [];

        return data.results.map((row: any) => ({
            id: row.invoice.id,
            issueDate: row.invoice.issueDate,
            dueDate: row.invoice.dueDate,
            totalAmountMicros: row.invoice.totalAmountMicros,
            currencyCode: row.invoice.currencyCode,
            pdfUrl: row.invoice.pdfUrl, // Provide if available
            resourceName: row.invoice.resourceName
        }));

    } catch (e) {
        console.error(`Error listing invoices for ${customerId}`, e);
        return [];
    }
};

export const downloadInvoicePdf = async (pdfUrl: string, accessToken: string): Promise<string | null> => {
    try {
        // pdfUrl is usually a direct authenticated link or requires headers.
        // Google Ads API docs say pdf_url usually works with the same auth headers.

        const res = await fetch(pdfUrl, {
            headers: {
                "Authorization": `Bearer ${accessToken}`
            }
        });

        if (!res.ok) return null;

        const arrayBuffer = await res.arrayBuffer();
        return Buffer.from(arrayBuffer).toString('base64');
    } catch (e) {
        console.error("Failed to download Google Ads PDF", e);
        return null;
    }
};
