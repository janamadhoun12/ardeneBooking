import fetch from 'node-fetch';
import XLSX from 'xlsx';
import { OpenAI } from 'openai';
import 'dotenv/config';

// Initialize Open AI client
const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY 
});

function getColumnValue(row, possibleKeys) {
    for (const key of possibleKeys) {
        if (row[key] != null && String(row[key]).trim() !== '') {
            const value = String(row[key]).trim();
            return value.replace(/\s*-\s*/g, '-');
        }
    }
    return null;
}

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function parseXlsWithOpenAi(url, booking, retries = 5, baseDelay = 2000) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status}`);
        }
        const buffer = await response.arrayBuffer();
        const workbook = XLSX.read(Buffer.from(buffer), { type: 'buffer' });

        const customer = booking.customer || { companyName: "Unknown" };
        const sheetIndex = customer.companyName === "George Courey Inc" ? 1 : 0;

        if (!workbook.SheetNames[sheetIndex]) {
            throw new Error(`Sheet at index ${sheetIndex} does not exist in the workbook`);
        }
        const sheet = workbook.SheetNames[sheetIndex];
        let rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheet], { defval: null }).filter(row => 
            Object.values(row).some(val => val != null && String(val).trim() !== '')
        );

        // Pre-process rows to skip headers for George Courey
        if (customer.companyName === "George Courey Inc") {
            rows = rows.filter(row => {
                const emptyCol = getColumnValue(row, ['__EMPTY']);
                const productName = getColumnValue(row, ['__EMPTY_1']);
                const skuCol = getColumnValue(row, ['__EMPTY_2']);
                return !(emptyCol === "SIZE:" || productName === "PRODUCT NAME" || skuCol === "ITEM NO:");
            });
        }

        // Convert rows to CSV for Open AI prompt
        const csvRows = XLSX.utils.sheet_to_csv(workbook.Sheets[sheet], { 
            FS: ",", 
            RS: "\n",
            strip: false,
            blankrows: false,
            skipHidden: true,
            forceQuotes: true
        });

        if (!csvRows || csvRows.trim() === '') {
            throw new Error('CSV conversion resulted in empty or invalid data');
        }

        // Define the prompt for Open AI
        const prompt = `
Extract POs, SKUs, and total CBM from this CSV text for ${customer.companyName}:

- POs: Find "AS PER APPLICANT'S P.O.: XXXXX" and extract XXXXX as the PO. Each PO applies to Item Numbers below it until the next PO appears. PO's are also referred to as "PO", "PO #", "Purchase Order".
- SKUs: Find "ITEM NO:" followed by a value (e.g., "ITEM NO: L14023-11") OR called "Style Number" with the values below OR called "SKU" OR called "SKU No." OR called "STYLE" (which all represent SKU) with values to the right and extract the value as the SKU (string, not object). Pair each SKU with its most recent preceding PO.
- CBM: Find "CBM", "Measurement CBM". If not found, estimate using "TOTAL QUANTITY: XXX CTN" (e.g., "TOTAL QUANTITY: 196 CTN") as XXX * 0.1 (e.g., 196 * 0.1 = 19.6). If not found, add up the values of the individual "CBM's" in the each row. Use 0 if neither is found. Prioritize the "CBM Total" or "CBM measurement" value in the CSV.
- Output: A JSON array of objects, each with "po" (string), "sku" (string), and "total_cbm" (number, same for all entries).

CSV Text:
${csvRows}
        `;

        let extractData;
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const openAIresponse = await client.chat.completions.create({
                    model: 'gpt-4o-mini',
                    messages: [{ role: 'user', content: prompt }],
                    max_tokens: 2048
                });

                let responseContent = openAIresponse.choices[0].message.content.trim();
                // Remove code block markers and extract JSON
                responseContent = responseContent.replace(/```json\n?|\n?```/g, '');
                const jsonMatch = responseContent.match(/\[[\s\S]*\]/); // Fixed regex
                if (jsonMatch) {
                    responseContent = jsonMatch[0];
                }

                // Parse JSON
                try {
                    extractData = JSON.parse(responseContent);
                } catch (jsonError) {
                    console.error(`JSON parsing failed: ${jsonError.message}`);
                    throw new Error(`Invalid JSON response from Open AI: ${responseContent}`);
                }

                // Validate response format (array of objects with po, sku, total_cbm)
                if (!Array.isArray(extractData) || !extractData.every(item => 
                    typeof item === 'object' && 
                    item.po && typeof item.po === 'string' && 
                    item.sku && typeof item.sku === 'string' && 
                    typeof item.total_cbm === 'number'
                )) {
                    throw new Error('Invalid response format from Open AI');
                }

                break; // Exit retry loop on success
            } catch (error) {
                if (error.response && error.response.status === 429 && attempt < retries) {
                    const retryAfter = error.response.headers.get('Retry-After') || (attempt * baseDelay);
                    const waitTime = parseInt(retryAfter, 10) * 1000 || attempt * baseDelay;
                    console.log(`Rate limit hit (429). Retrying after ${waitTime / 1000} seconds... (attempt ${attempt}/${retries})`);
                    await delay(waitTime);
                } else {
                    throw new Error(`Open AI parsing failed: ${error.message}`);
                }
            }
        }

        if (!extractData) {
            throw new Error('Failed to extract valid JSON from Open AI response after retries');
        }

        // Transform response to match index.js expectations
        const bookingData = extractData.map(item => ({
            orderNumber: item.po,
            primeFreightRef: booking.primeFreightRef,
            styleNumber: item.sku,
            cbm: item.total_cbm || 0
        }));

        // Validate that at least one valid entry exists
        if (bookingData.length === 0) {
            throw new Error('No valid PO-SKU pairs extracted from Open AI response');
        }

        return bookingData;
    } catch (error) {
        console.error(`Error in Open AI parsing for URL ${url}: ${error.message}`);
        throw error;
    }
}

export { parseXlsWithOpenAi };