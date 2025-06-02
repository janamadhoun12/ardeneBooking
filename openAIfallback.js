import fetch from 'node-fetch';
import XLSX from 'xlsx';
import { OpenAI } from 'openai';
import 'dotenv/config';

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

async function parseXlsWithOpenAi(url, booking) {
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

        // Pre-process rows to skip headers for George Courey to avoid "size" property issue
        if (customer.companyName === "George Courey Inc") {
            rows = rows.filter(row => {
                const emptyCol = getColumnValue(row, ['__EMPTY']);
                const productName = getColumnValue(row, ['__EMPTY_1']);
                const skuCol = getColumnValue(row, ['__EMPTY_2']);
                return !(emptyCol === "SIZE:" || productName === "PRODUCT NAME" || skuCol === "ITEM NO:");
            });
        }

        // Convert rows to CSV for Open AI prompt
        const csvRows = XLSX.utils.sheet_to_csv(workbook.Sheets[sheet], { FS: ",", RS: "\n" });
        const rawText = csvRows;

        // Define the prompt for Open AI
        const prompt = `
        Extract POs, SKUs, and total CBM from this XLS content for ${customer.companyName}:
        
        - **POs**: Labeled "PO", "PO Number", or "Purchase Order". For George Courey: may be in "PO" or description (e.g., "AS PER APPLICANT'S P.O.: XXXXX").
        - **SKUs**: Labeled "SKU", "SKU No.", "Style No.", or "Item No.". For George Courey: in "Item No." or "Style No." (often in column "__EMPTY_2").
        - **CBM**: Labeled "CBM" or "Booked Measurement". For George Courey: find total or sum values (often in column "__EMPTY_27", with total in a "TOTALS:" row).
        - **Notes**: For George Courey, use PrimeFreightRef ${booking.primeFreightRef} as the booking identifier. If SKUs are missing, use "". If CBM is missing, use 0.
        
        Return JSON: { "pos": ["PO123"], "skus": ["SKU001"], "cbm": 1.5 }
        
        XLS Content (CSV):
        ${rawText}
        `;

        // Call Open AI
        const openAIresponse = await client.chat.completions.create({
            model: 'gpt-4o',
            messages: [{
                role: 'user',
                content: prompt
            }],
            max_tokens: 4096
        });

        const extractData = JSON.parse(openAIresponse.choices[0].message.content);

        // Transform the response into the format expected by index.js
        const bookingData = {
            [booking.primeFreightRef]: {
                poSkuPairs: extractData.pos.map((po, index) => ({
                    orderNumber: po,
                    styleNumber: extractData.skus[index] || ''
                })),
                totalCBM: extractData.cbm || 0
            }
        };

        return bookingData;
    } catch (error) {
        console.error(`Error in Open AI parsing for URL ${url}: ${error.message}`);
        throw error;
    }
}

export { parseXlsWithOpenAi };