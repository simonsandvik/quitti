import * as XLSX from 'xlsx';

export interface RawData {
    rows: string[][];
    encoding: 'UTF-8' | 'Latin-1';
    delimiter: string;
    hasHeader: boolean;
    columnCount: number;
}

export interface ColumnMapping {
    dateIndex: number | null;
    amountIndex: number | null;
    merchantIndex: number | null;
    ignoreIndices: number[];
}

export type ColumnType = 'date' | 'amount' | 'merchant' | 'date_merchant' | 'ignore';

/**
 * Step 1: Ingestion & Detection
 */
export async function ingestFile(file: File, manualDelimiter?: string): Promise<RawData> {
    const extension = file.name.split('.').pop()?.toLowerCase();

    // If user provided a manual delimiter, we skip detection logic for CSV
    // Excel doesn't use delimiters
    if (extension === 'xlsx' || extension === 'xls') {
        const data = await ingestExcel(file);
        return { ...data, columnCount: Math.max(...data.rows.map(r => r.length), 0) };
    } else {
        const data = await ingestCSV(file, manualDelimiter);
        return { ...data, columnCount: Math.max(...data.rows.map(r => r.length), 0) };
    }
}

async function ingestExcel(file: File): Promise<RawData> {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { cellDates: true, cellText: true, cellNF: true });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    // Use raw: false to get formatted strings for dates if possible
    const rows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '', raw: false });

    const processedRows = rows.map(row =>
        (Array.isArray(row) ? row : []).map(cell =>
            cell === null || cell === undefined ? '' : String(cell).trim()
        )
    );

    return {
        rows: processedRows,
        encoding: 'UTF-8',
        delimiter: ',', // irrelevant for Excel
        hasHeader: detectHeader(processedRows),
        columnCount: 0
    };
}

async function ingestCSV(file: File, manualDelimiter?: string): Promise<RawData> {
    const buffer = await file.arrayBuffer();

    // Detect Encoding & Remove BOM
    let encoding: 'UTF-8' | 'Latin-1' = 'UTF-8';
    let text = new TextDecoder('utf-8').decode(buffer);

    if (text.includes('\uFFFD')) {
        encoding = 'Latin-1';
        text = new TextDecoder('windows-1252').decode(buffer);
    }

    text = text.replace(/^\uFEFF/, '');
    const allLines = text.split(/\r?\n/).filter(l => l.trim());

    let bestDelimiter = manualDelimiter;

    if (!bestDelimiter) {
        // Detect Delimiter using "Mode" logic (consistency check)
        // We look for the delimiter that produces the SAME number of columns for the LARGEST subset of rows
        const sampleLines = allLines.filter(l => l.length > 5).slice(0, 200);
        const commonDelimiters = [';', ',', '\t', '|'];

        let bestScore = -1;

        commonDelimiters.forEach(d => {
            const counts = sampleLines.map(line => splitLine(line, d).length);
            // Count frequencies: { "3": 10 rows, "12": 90 rows }
            const frequency: Record<number, number> = {};
            counts.forEach(c => {
                frequency[c] = (frequency[c] || 0) + 1;
            });

            // Find the Mode (most common column count)
            let mode = 0;
            let maxFreq = 0;
            Object.entries(frequency).forEach(([colsStr, freq]) => {
                const cols = parseInt(colsStr);
                if (cols > 1 && freq > maxFreq) {
                    maxFreq = freq;
                    mode = cols;
                }
            });

            // Score = Consistency % * Log(Mode) 
            // We multiply by Mode because we prefer more columns (e.g. 12 cols > 2 cols if equal consistency)
            const consistency = maxFreq / sampleLines.length;
            const score = consistency * Math.log2(mode);

            if (score > bestScore) {
                bestScore = score;
                bestDelimiter = d;
            }
        });

        // Default to comma if nothing good found
        if (!bestDelimiter) bestDelimiter = ',';
    }

    const rows = allLines.map(line => splitLine(line, bestDelimiter!));

    return {
        rows,
        encoding,
        delimiter: bestDelimiter!,
        hasHeader: detectHeader(rows),
        columnCount: 0
    };
}

function splitLine(line: string, delimiter: string): string[] {
    const result: string[] = [];
    let cur = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === delimiter && !inQuotes) {
            result.push(cur.trim().replace(/^"|"$/g, ''));
            cur = '';
        } else {
            cur += char;
        }
    }
    result.push(cur.trim().replace(/^"|"$/g, ''));
    return result;
}

function detectHeader(rows: string[][]): boolean {
    const validRows = rows.filter(r => r.length > 2);
    if (validRows.length < 2) return false;
    const row1 = validRows[0];
    const row2 = validRows[1];

    let textDensity1 = row1.filter(c => isNaN(Number(c.replace(',', '.'))) && c.length > 0).length / (row1.length || 1);
    let textDensity2 = row2.filter(c => isNaN(Number(c.replace(',', '.'))) && c.length > 0).length / (row2.length || 1);

    return textDensity1 > textDensity2;
}

/**
 * Aggressive Date Detection
 */
function isLikelyDate(val: string): boolean {
    const s = val.trim();
    if (!s || s.length < 6) return false;

    // 1. ISO or European with separators: 2025-01-26, 26.01.2025, 26/01/25, 1.1.26
    if (/^\d{1,4}[./-\s]\d{1,2}[./-\s]\d{2,4}/.test(s)) return true;

    // 2. Compact: 20250126 or 26012025
    if (/^\d{8}$/.test(s)) return true;

    // 3. Embedded date check (e.g. "Payment 02.03.2025 details")
    if (/(\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b)/.test(s)) return true;
    if (/(\b\d{4}[./-]\d{1,2}[./-]\d{1,2}\b)/.test(s)) return true;

    // 4. Fallback to native parse for things like "Jan 1"
    if (!isNaN(Date.parse(s.replace(/\./g, '/')))) return true;

    return false;
}

/**
 * Step 2: Heuristic mapping
 */
export function guessMapping(rows: string[][], hasHeader: boolean): ColumnMapping {
    const mapping: ColumnMapping = {
        dateIndex: null,
        amountIndex: null,
        merchantIndex: null,
        ignoreIndices: []
    };

    if (rows.length === 0) return mapping;

    const startRow = hasHeader ? 1 : 0;
    const colCount = Math.max(...rows.slice(0, 50).map(r => r.length), 0);
    const sampleSize = Math.min(rows.length, 150);

    for (let col = 0; col < colCount; col++) {
        let dateScore = 0;
        let amountScore = 0;
        let textScore = 0;
        let hits = 0;

        for (let r = startRow; r < sampleSize; r++) {
            const val = rows[r]?.[col];
            if (!val || val.trim() === '') continue;
            hits++;

            if (isLikelyDate(val)) dateScore++;

            const cleanAmount = val.replace(/[^0-9,.-]/g, '');
            if (cleanAmount && /^-?\d+([.,]\d+)?$/.test(cleanAmount)) amountScore++;

            // Heuristic for text that ISN'T just a date or amount
            // If it has letters and is long enough
            if (val.length > 5 && /[a-zA-Z]/.test(val)) {
                textScore++;
            }
        }

        if (hits < 2) continue;

        // Check for combined scenario first
        const isMixed = (dateScore > hits * 0.3) && (textScore > hits * 0.4);

        if (isMixed && mapping.dateIndex === null && mapping.merchantIndex === null) {
            mapping.dateIndex = col;
            mapping.merchantIndex = col;
        } else if (dateScore > hits * 0.3 && mapping.dateIndex === null) {
            mapping.dateIndex = col;
        } else if (amountScore > hits * 0.3 && mapping.amountIndex === null) {
            mapping.amountIndex = col;
        } else if (textScore > hits * 0.4 && mapping.merchantIndex === null) {
            mapping.merchantIndex = col;
        } else if ((dateScore > hits * 0.3 || textScore > hits * 0.4) && mapping.merchantIndex === null) {
            // Fallback for tricky scenarios: if we haven't found a merchant column yet, 
            // and this column is somewhat text-heavy OR date-heavy (but not captured by strict rules), take it.
            mapping.merchantIndex = col;
        }
    }

    return mapping;
}

export function normalizeData(
    rows: string[][],
    hasHeader: boolean,
    mapping: ColumnMapping,
    offset: number = 0
): any[] {
    const startRow = hasHeader ? offset + 1 : offset;
    const normalized = [];

    // Check if we are in "Merged" mode (special case where dateIndex === merchantIndex)
    // or if the mapping explicitly flags it (not yet implemented in ColumnMapping, so we infer from indices)
    const isMerged = (mapping.dateIndex !== null && mapping.dateIndex === mapping.merchantIndex);

    for (let i = startRow; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        let date: Date | null = null;
        let merchant = 'Unknown Entity';
        let amountStr = '';

        if (isMerged && mapping.dateIndex !== null) {
            const val = row[mapping.dateIndex];
            if (val) {
                // Extract date
                const datePattern = /(\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b)|(\b\d{4}[./-]\d{1,2}[./-]\d{1,2}\b)/;
                const match = val.match(datePattern);
                if (match) {
                    date = parseDate(match[0]);
                    // Merchant is the rest
                    merchant = cleanMerchant(val.replace(match[0], ''));
                } else {
                    merchant = cleanMerchant(val);
                }
            }
        } else {
            const dateStr = mapping.dateIndex !== null ? row[mapping.dateIndex] : '';
            const merchantStr = mapping.merchantIndex !== null ? row[mapping.merchantIndex] : '';

            date = parseDate(dateStr || '');
            merchant = cleanMerchant(merchantStr);
        }

        if (mapping.amountIndex !== null) amountStr = row[mapping.amountIndex] || '';
        const amount = parseAmount(amountStr);

        if (date && !isNaN(amount)) {
            normalized.push({
                id: `row-${i}-${Date.now()}`,
                date: date.toISOString().split('T')[0],
                merchant: merchant.trim() || 'Unknown Entity',
                amount: Math.abs(amount),
                currency: 'EUR'
            });
        }
    }

    return normalized;
}

function cleanMerchant(raw: string): string {
    if (!raw) return '';
    let s = raw;

    // Split by common separators like " - - " or multiple dashes
    // also handle " , " if it looks like a duplicate separator
    let parts = s.split(/\s+-\s+-\s+|\s+--\s+/);

    if (parts.length === 1 && s.includes(', Saaja:')) {
        // Fallback for when " - - " isn't present but "Saaja" indicates a second part
        parts = s.split(', Saaja:');
        if (parts[1]) parts[1] = 'Saaja: ' + parts[1]; // Restore Saaja for cleaning
    }

    const cleanParts = parts.map(p => {
        let clean = p;
        // 1. Extract payee
        const payeeMatch = clean.match(/(?:Saaja|Mottagare|Payee):\s*(.*)/i);
        if (payeeMatch) {
            clean = payeeMatch[1];
        }

        // 2. Remove noise
        clean = clean.replace(/\d{3,}\s*Kortköp/gi, '')
            .replace(/EUR\s*\d+[.,]\d+/gi, '')
            .replace(/Purchase\s*/gi, '')
            .replace(/^\s*[-*,.]+\s*/, '') // Leading punctuation
            .replace(/\s*[-*,.]+\s*$/, ''); // Trailing punctuation

        return clean.trim();
    }).filter(p => p.length > 0);

    // Deduplicate (case insensitive)
    const unique = cleanParts.filter((item, index) => {
        return cleanParts.findIndex(i => i.toLowerCase() === item.toLowerCase()) === index;
    });

    // Return the longest distinct part, or joined if different
    if (unique.length === 0) return '';
    // Usually the first part is good enough, or if we have [Name, City], maybe join?
    // User wants to avoid "Name - - Name".
    // If we have "LinkedIn", "LinkedIn", result is "LinkedIn".

    return unique[0];
}

function parseAmount(val: string): number {
    const clean = val.replace(/[^\d.,-]/g, '');
    if (!clean) return NaN;

    const lastDot = clean.lastIndexOf('.');
    const lastComma = clean.lastIndexOf(',');

    if (lastComma > lastDot && lastComma !== -1) {
        return parseFloat(clean.replace(/\./g, '').replace(',', '.'));
    } else if (lastDot !== -1) {
        return parseFloat(clean.replace(/,/g, ''));
    } else if (lastComma !== -1) {
        return parseFloat(clean.replace(',', '.'));
    }
    return parseFloat(clean);
}

function parseDate(val: string): Date | null {
    const s = val.trim();
    if (!s) return null;

    let dateString = s;

    // 0. Extract date from mixed string if present (e.g. "Text 01.02.2025 Text")
    // Regex for DD.MM.YYYY, DD/MM/YYYY, YYYY-MM-DD
    const extractRegex = /(\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b)|(\b\d{4}[./-]\d{1,2}[./-]\d{1,2}\b)/;
    const match = s.match(extractRegex);
    if (match) {
        dateString = match[0];
    }

    // 1. Handle compact formats: YYYYMMDD or DDMMYYYY
    if (/^\d{8}$/.test(dateString)) {
        if (dateString.startsWith('20')) { // Likely YYYYMMDD
            return new Date(parseInt(dateString.substring(0, 4)), parseInt(dateString.substring(4, 6)) - 1, parseInt(dateString.substring(6, 8)));
        } else { // Assume DDMMYYYY
            return new Date(parseInt(dateString.substring(4, 8)), parseInt(dateString.substring(2, 4)) - 1, parseInt(dateString.substring(0, 2)));
        }
    }

    // 2. Manual split (Prioritize EU: DD.MM.YYYY)
    const parts = dateString.split(/[./-\s]/).filter(p => p.length > 0);
    if (parts.length >= 3) {
        let d, m, y;
        if (parts[0].length === 4) { // YYYY-MM-DD
            y = parseInt(parts[0]);
            m = parseInt(parts[1]);
            d = parseInt(parts[2]);
        } else { // DD-MM-YYYY
            d = parseInt(parts[0]);
            m = parseInt(parts[1]);
            // Handle 2-digit years
            y = parts[2].length === 2 ? 2000 + parseInt(parts[2]) : parseInt(parts[2]);
            // If month > 12, it's definitely not DD-MM-YYYY, so swap to MM-DD-YYYY
            if (m > 12 && d <= 12) [d, m] = [m, d];
        }
        const res = new Date(y, m - 1, d);
        if (!isNaN(res.getTime())) return res;
    }

    // 3. Fallback: Native Date parse
    const timestamp = Date.parse(dateString.replace(/\./g, '/'));
    if (!isNaN(timestamp)) {
        return new Date(timestamp);
    }

    return null;
}

/**
 * Step 3: Start Row Detection
 * Detects where the "real" transaction data begins by looking for a block of consistent rows.
 */
export function detectStartRow(rows: string[][]): number {
    if (rows.length < 2) return 0;

    const scores = rows.map((row, index) => {
        if (!row || row.length < 2) return 0; // Ignore empty/short rows

        let validAmount = false;
        let validText = false;
        let validDate = false;

        row.forEach(cell => {
            if (!cell) return;
            const val = cell.trim();
            if (!val) return;

            // Check amount
            const cleanAmount = val.replace(/[^0-9,.-]/g, '');
            if (cleanAmount && /^-?\d+([.,]\d+)?$/.test(cleanAmount)) {
                // Must have at least one digit
                if (/\d/.test(cleanAmount)) validAmount = true;
            }

            // Check Date
            if (isLikelyDate(val)) validDate = true;

            // Check Text (Merchant/Description) - exclude pure numbers/amounts
            if (val.length > 5 && /[a-zA-Z]/.test(val) && isNaN(Number(val.replace(',', '.')))) {
                validText = true;
            }
        });

        // A transaction row typically looks like: [Date, Text, Amount] or [Text/Date, Amount]
        if (validAmount && (validText || validDate)) return 1;
        return 0;
    });

    // Find a sequence of at least 3 high-score rows
    for (let i = 0; i < scores.length - 2; i++) {
        if (scores[i] === 1 && scores[i + 1] === 1 && scores[i + 2] === 1) {
            // Found a block! Return the start of this block.
            return i;
        }
    }

    // Fallback: Find first row with valid amount + date/text
    const firstGood = scores.findIndex(s => s === 1);
    return firstGood !== -1 ? firstGood : 0;
}
