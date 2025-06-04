import { GetAllBookings } from './getAllBookings.js';
import { GenerateToken } from './generateToken.js';
import fetch from 'node-fetch';
import XLSX from 'xlsx';
import { parseXlsWithOpenAi } from './openAIfallback.js';

const url = 'https://primefreight-development.betty.app/api/runtime/fba8c23dd1104240bfdb9a1b10ef6dbe';
const prod_url = 'https://primefreight.betty.app/api/runtime/da93364a26fb4eeb9e56351ecec79abb';

async function getJSON(url, booking) {
    const customer = booking.customer || { companyName: "Unknown" };
    const isArdene = customer.companyName.includes("Ardene"); 
    console.log(`Processing booking ${booking.primeFreightRef} for customer: ${customer.companyName}`);

    if (isArdene) {
        console.log(`Parsing booking ${booking.primeFreightRef}`);
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP Error: ${response.status}`);
            }
            const buffer = await response.arrayBuffer();
            const workbook = XLSX.read(Buffer.from(buffer), { type: 'buffer' });
            const sheet = workbook.SheetNames[0];
            if (!sheet) {
                throw new Error('No sheets found in Excel file');
            }
            const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheet], { defval: null }).filter(row =>
                Object.values(row).some(val => val != null && String(val).trim() !== '')
            );
            console.log(`Extracted ${rows.length} rows for booking ${booking.primeFreightRef}`);
            if (rows.length === 0) {
                throw new Error('No valid data found in Excel sheet');
            }

            const bookingData = extractBooking(rows);
            const bookingEntry = bookingData[booking.primeFreightRef] || { poSkuPairs: [], totalCBM: 0 };
            console.log(`Extracted ${bookingEntry.poSkuPairs.length} PO-SKU pairs for booking ${booking.primeFreightRef}`);
            return bookingEntry;
        } catch (e) {
            console.error(`Excel parsing failed for URL ${url} (booking ${booking.primeFreightRef}, customer ${customer.companyName}): ${e.message}`);
            throw e; // Skip Ardene booking if parsing fails
        }

     } else {
        console.log(`Using Open AI fallback for booking ${booking.primeFreightRef}`);
        try {
            const openAiData = await parseXlsWithOpenAi(url, booking);
            console.log(`Open AI fallback succeeded for booking ${booking.primeFreightRef}, extracted ${openAiData.length} PO-SKU pairs`);
            return openAiData.map(item => ({
                'PO Number': item.orderNumber,
                'SKU': item.styleNumber,
                'Booked Measurement': item.cbm,
                'Booking Number': item.primeFreightRef,
                'ASN': item.styleNumber 
            }));
        } catch (fallbackError) {
            console.error(`Open AI fallback failed for URL ${url} (booking ${booking.primeFreightRef}): ${fallbackError.message}`);
            throw fallbackError;
        }
    }
}

function getColumnValue(row, possibleKeys) {
    for (const key of possibleKeys) {
        if (row[key] != null && String(row[key]).trim() !== '') {
            const value = String(row[key]).trim();
            return value.replace(/\s*\([^)]*\)/g, '').replace(/\s*-\s*/g, '-');        
        }
    }
    return null;
}

function extractBooking(rows) {
    const bookings = {};
    let lastValidPo = null;
    let currentBookingNumber = null;
    let hasAsn = false;
    const seenPairs = new Set();

    console.log(`Extracting bookings from ${rows.length} rows`);

    for (const row of rows) {
        const asn = getColumnValue(row, ['ASN', 'ASN Number']);
        if (asn && asn.trim() !== '') {
            hasAsn = true;
            break;
        }
    }

    rows.forEach(row => {
        let po = getColumnValue(row, ['PO Number']);
        const bookingNumber = getColumnValue(row, ['Booking Number']);
        const asn = getColumnValue(row, ['ASN', 'ASN Number']);
        const sku = getColumnValue(row, ['SKU', 'SKU No.']);
        let styleNum = null;

        if (po && po.startsWith('PO#:')) {
            po = po.replace('PO#:', '').trim();
        }

        if (bookingNumber && bookingNumber.trim() !== '') {
            currentBookingNumber = bookingNumber;
            if (!bookings[currentBookingNumber]) {
                bookings[currentBookingNumber] = { poSkuPairs: [], totalCBM: 0 };
            }
        }

        if (po && po.trim() !== '') {
            lastValidPo = po;
        }

        if (hasAsn) {
            if (asn && asn.trim() !== '') {
                styleNum = asn;
            } else {
                return;
            }
        } else {
            if (sku && sku.trim() !== '') {
                styleNum = sku;
            }
        }

        if (styleNum && lastValidPo && currentBookingNumber) {
            const pairKey = `${lastValidPo}-${styleNum}`;
            if (!seenPairs.has(pairKey)) {
                seenPairs.add(pairKey);
                bookings[currentBookingNumber].poSkuPairs.push({ orderNumber: lastValidPo, styleNumber: styleNum });
            }
        }

        if (currentBookingNumber) {
            const cmRaw = row['Booked Measurement'];
            const cm = Number(cmRaw);
            if (!Number.isNaN(cm) && cm > 0) {
                bookings[currentBookingNumber].totalCBM += cm;
            }
        }
    });

    for (const bookingNumber in bookings) {
        bookings[bookingNumber].totalCBM = Number(bookings[bookingNumber].totalCBM.toFixed(2));
        console.log(`Extracted ${bookings[bookingNumber].poSkuPairs.length} PO-SKU pairs for booking ${bookingNumber}, total CBM: ${bookings[bookingNumber].totalCBM}`);
    }

    return bookings;
}

async function callAddPoSkuAction(jwtToken, primeFreightRef, orderNumber, styleNumber, cbm) {
    if (!primeFreightRef || primeFreightRef.trim() === '') {
        throw new Error(`Invalid Prime Booking Number: ${primeFreightRef}`);
    }
    if (!orderNumber || orderNumber.trim() === '') {
        throw new Error(`Invalid PO: ${orderNumber}`);
    }
    if (!styleNumber || styleNumber.trim() === '') {
        throw new Error(`Invalid SKU: ${styleNumber}`);
    }

    const body = {
        query: `mutation { action(id: $id, input: $input) }`,
        variables: {
            id: "6329b281826647ac90389cc6937a293a",
            input: {
                payload: {
                    orderNumber,
                    primeFreightRef,
                    styleNumber,
                    cbm
                }
            }
        }
    };

    const res = await fetch(prod_url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${jwtToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Action failed (${res.status}): ${err}`);
    }

    const result = await res.json();
    return result;
}

async function main() {
    try {
        const auth = new GenerateToken(prod_url);
        const { jwtToken } = await auth.login();
        const svc = new GetAllBookings(prod_url);
        let bookings = await svc.getTodayBookings();

        if (bookings.length === 0) {
            console.log("No bookings found for today.");
            return;
        }

        console.log(`Found ${bookings.length} bookings to process:`, bookings.map(b => ({
            primeFreightRef: b.primeFreightRef,
            customer: b.customer?.companyName || "Unknown"
        })));

        const bookingDataMap = new Map();

        for (const booking of bookings) {
            const { primeFreightRef, packingList, customer, pos } = booking;
            if (!packingList || !packingList.url) {
                console.log(`Skipping booking ${primeFreightRef}: No packing list URL.`);
                continue;
            }
            if (pos && pos.length > 0) {
                console.log(`Skipping booking ${primeFreightRef}: Already has ${pos.length} POs associated.`);
                continue;
            }
            let bookingData;
            try {
                const isArdene = customer?.companyName?.includes("Ardene Holdings Inc");
                const data = await getJSON(packingList.url, booking);
                if (isArdene) {
                    bookingData = data;
                } else {
                    bookingData = extractBooking(data)[primeFreightRef] || { poSkuPairs: [], totalCBM: 0 };
                }
            } catch (e) {
                console.log(`Failed to fetch or parse Excel for booking ${primeFreightRef}: ${e.message}`);
                continue;
            }

            bookingDataMap.set(primeFreightRef, bookingData);
        }

        const processedBookingNos = new Set();

        for (const [primeFreightRef, booking] of bookingDataMap.entries()) {
            if (processedBookingNos.has(primeFreightRef)) {
                continue;
            }

            const matchedBooking = bookings.find(b => b.primeFreightRef === primeFreightRef);
            if (!matchedBooking) {
                continue;
            }

            const { poSkuPairs, totalCBM } = booking;

            if (poSkuPairs.length > 0) {
                let currentCBM = totalCBM;
                for (const pair of poSkuPairs) {
                    try {
                        console.log(`Prime Booking Number ${primeFreightRef} ← PO=${pair.orderNumber}, SKU=${pair.styleNumber} with CBM=${currentCBM}`);
                        const result = await callAddPoSkuAction(jwtToken, primeFreightRef, pair.orderNumber, pair.styleNumber, currentCBM);
                        if (result?.data?.action?.cbm != null) {
                            currentCBM = Number(result.data.action.cbm);
                            console.log(`Updated CBM from response: ${currentCBM}`);
                        }
                    } catch (e) {
                        console.log(`Failed for PO=${pair.orderNumber}, SKU=${pair.styleNumber}: ${e.message}`);
                        continue;
                    }
                }
                processedBookingNos.add(primeFreightRef);
            }
        }
    } catch (err) {
        console.log(`Main error: ${err.message}`);
        return;
    }
}

main().catch(err => {
    console.error('Script failed:', err);
    process.exit(1);
});