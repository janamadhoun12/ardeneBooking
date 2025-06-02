// import { GetAllBookings } from './getAllBookings.js';
// import { GenerateToken } from './generateToken.js';
// import fetch from 'node-fetch';
// import XLSX from 'xlsx';
// import { parseXlsWithOpenAi } from './openAIfallback.js';
// // import cron from 'node-cron';

// const url = 'https://primefreight-development.betty.app/api/runtime/fba8c23dd1104240bfdb9a1b10ef6dbe';
// const prod_url = 'https://primefreight.betty.app/api/runtime/da93364a26fb4eeb9e56351ecec79abb';

// async function getJSON(url, booking) {

//     try {
//        const response = await fetch(url);
//         if (!response.ok) {
//             throw new Error(`HTTP Error: ${response.status}`);
//         }
//         const buffer = await response.arrayBuffer();
//         const workbook = XLSX.read(Buffer.from(buffer), { type: 'buffer' });
//         const customer = booking.customer || { companyName: "Unknown" };
//         const isGeorgeCourey = customer.companyName === "George Courey Inc";
//         // "George Courey Inc";
//         const sheetIndex = isGeorgeCourey ? 1: 0;

//         if (!workbook.SheetNames[sheetIndex]) {
//             throw new Error(`Sheet at index ${sheetIndex} does not exist in the workbook`);
//         }
//         const sheet = workbook.SheetNames[sheetIndex];
//         const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheet], { defval: null }).filter(row => 
//             Object.values(row).some(val => val != null && String(val).trim() !== '')
//         );

//         if (isGeorgeCourey) {
//             return rows.map(row => ({
//                 ...row,
//                 'Booking Number': booking.primeFreightRef
//             }));
//         }

//         return rows;
        
        

//     } catch (e) {
//         console.error(`XLS parsing failed for URL ${url}: ${e.message}`);
//         // try {
//         //     const bookingData = await parseXLS(url, booking);
//         //     return [bookingData];
//         // } catch (fallbackError) {
//         //     console.error(`Fallback parsing failed for URL ${url}: ${fallbackError.message}`);
//         //     throw fallbackError;
//         // }
//     }
    
// }

// function getColumnValue(row, possibleKeys) {
//     for (const key of possibleKeys) {
//         if (row[key] != null && String(row[key]).trim() !== '') {
//             const value = String(row[key]).trim();
//             return value.replace(/\s*-\s*/g, '-');
//         }
//     }
//     return null;
// }

// function extractBooking(rows) {
//     const bookings = {};
//     let lastValidPo = null;
//     let currentBookingNumber = null;
//     let hasAsn = false;
//     const seenPairs = new Set();

//     for (const row of rows) {
//         const asn = getColumnValue(row, ['ASN']);
//         if (asn && asn.trim() !== '') {
//             hasAsn = true;
//             break;
//         }
//     }

//     rows.forEach(row => {
//         let po = getColumnValue(row, ['PO Number']);
//         const bookingNumber = getColumnValue(row, ['Booking Number']);
        
//         const asn = getColumnValue(row, ['ASN']);
//         const sku = getColumnValue(row, ['SKU', 'SKU No.']);
//         let styleNum = null;
        
//         if (po && po.startsWith('PO#:')) {
//             po = po.replace('PO#:', '').trim();
//         }
        
//         if (bookingNumber && bookingNumber.trim() !== '') {
//             currentBookingNumber = bookingNumber;
//             if (!bookings[currentBookingNumber]) {
//                 bookings[currentBookingNumber] = { poSkuPairs: [], totalCBM: 0 };
//             }
//         }

//         if (po && po.trim() !== '') {
//             lastValidPo = po;
//         }

//         if (hasAsn) {
//             if (asn && asn.trim() !== '') {
//                 styleNum = asn;
//             } else {
//                 return;
//             }
//         } else {
//             if (sku && sku.trim() !== '') {
//                 styleNum = sku;
//             }
//         }

//         if (styleNum && lastValidPo && currentBookingNumber) {
//             const pairKey = `${lastValidPo}-${styleNum}`;
//             if (!seenPairs.has(pairKey)) {
//                 seenPairs.add(pairKey);
//                 bookings[currentBookingNumber].poSkuPairs.push({ orderNumber: lastValidPo, styleNumber: styleNum });
//             }
//         }

//         if (currentBookingNumber) {
//             const cmRaw = row['Booked Measurement'];
//             const cm = Number(cmRaw);
//             if (!Number.isNaN(cm) && cm > 0) {
//                 bookings[currentBookingNumber].totalCBM += cm;
//             }
//         }
//     });

//     for (const bookingNumber in bookings) {
//         bookings[bookingNumber].totalCBM = Number(bookings[bookingNumber].totalCBM.toFixed(2));
//     }

//     return bookings;
// }

// async function callAddPoSkuAction(jwtToken, primeFreightRef, orderNumber, styleNumber, cbm) {
//     if (!primeFreightRef || primeFreightRef.trim() === '') {
//         throw new Error(`Invalid Prime Booking Number: ${primeFreightRef}`);
//     }
//     if (!orderNumber || orderNumber.trim() === '') {
//         throw new Error(`Invalid PO: ${orderNumber}`);
//     }
//     if (!styleNumber || styleNumber.trim() === '') {
//         throw new Error(`Invalid SKU: ${styleNumber}`);
//     }

//     const body = {
//         query: `mutation { action(id: $id, input: $input) }`,
//         variables: {
//             id: "6329b281826647ac90389cc6937a293a",
//             input: {
//                 payload: {
//                     orderNumber,
//                     primeFreightRef,
//                     styleNumber,
//                     cbm
//                 }
//             }
//         }
//     };

//     const res = await fetch(url, {
//         method: 'POST',
//         headers: {
//             'Authorization': `Bearer ${jwtToken}`,
//             'Content-Type': 'application/json'
//         },
//         body: JSON.stringify(body)
//     });

//     if (!res.ok) {
//         const err = await res.text();
//         throw new Error(`Action failed (${res.status}): ${err}`);
//     }

//     const result = await res.json();
//     return result;
// }

// async function main() {
//     try {
//         const auth = new GenerateToken(url);
//         const { jwtToken } = await auth.login();
//         const svc = new GetAllBookings(url);
//         let bookings = await svc.getTodayBookings();

//         if (bookings.length === 0) {
//             console.log("No bookings found for today.")
//             return;
//         }

//         const bookingDataMap = new Map();

//         for (const booking of bookings) {
//             const { primeFreightRef, packingList } = booking;
//             if (!packingList || !packingList.url) {
//                 continue;
//             }

//             let rows;
//             try {
//                 rows = await getJSON(packingList.url, booking);
//             } catch (e) {
//                 continue;
//             }

//             const bookingData = extractBooking(rows);
//             bookingDataMap.set(primeFreightRef, bookingData[primeFreightRef] || { poSkuPairs: [], totalCBM: 0 });
//         }

//         const processedBookingNos = new Set();

//         for (const [primeFreightRef, booking] of bookingDataMap.entries()) {
//             if (processedBookingNos.has(primeFreightRef)) {
//                 continue;
//             }

//             const matchedBooking = bookings.find(b => b.primeFreightRef === primeFreightRef);
//             if (!matchedBooking) {
//                 continue;
//             }

//             const { poSkuPairs, totalCBM } = booking;

//             if (poSkuPairs.length > 0) {
//                 let currentCBM = totalCBM;
//                 for (const pair of poSkuPairs) {
//                     try {
//                         console.log(`Prime Booking Number ${primeFreightRef} ← PO=${pair.orderNumber}, SKU=${pair.styleNumber} with CBM=${currentCBM}`);
//                         const result = await callAddPoSkuAction(jwtToken, primeFreightRef, pair.orderNumber, pair.styleNumber, currentCBM);
//                         if (result?.data?.action?.cbm != null) {
//                             currentCBM = Number(result.data.action.cbm);
//                             console.log(`Updated CBM from response: ${currentCBM}`);
//                         }
//                     } catch (e) {
//                         console.log(`Failed for PO=${pair.orderNumber}, SKU=${pair.styleNumber}: ${e.message}`);
//                         continue;
//                     }
//                 }
//                 processedBookingNos.add(primeFreightRef);
//             }
//         }
//     } catch (err) {
//         console.log(`Main error: ${err.message}`);
//         return;
//     }
// }
// main().catch(err => {
//     console.error('Script failed:', err);
//     process.exit(1);
// });
// const Apify = require('apify');

import { GetAllBookings } from './getAllBookings.js';
import { GenerateToken } from './generateToken.js';
import { parseXlsWithOpenAi } from './openAIfallback.js';
import fetch from 'node-fetch';
import XLSX from 'xlsx';
import 'dotenv/config';

const url = 'https://primefreight-development.betty.app/api/runtime/fba8c23dd1104240bfdb9a1b10ef6dbe';
const prod_url = 'https://primefreight.betty.app/api/runtime/da93364a26fb4eeb9e56351ecec79abb';

async function getJSON(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`);
    }
    const buffer = await response.arrayBuffer();
    const workbook = XLSX.read(Buffer.from(buffer), { type: 'buffer' });
    const sheet = workbook.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheet], { defval: null }).filter(row => 
        Object.values(row).some(val => val != null && String(val).trim() !== '')
    );
    return rows;
}

function getColumnValue(row, possibleKeys) {
    for (const key of possibleKeys) {
        if (row[key] != null && String(row[key]).trim() !== '') {
            const value = String(row[key]).trim();
            return value.replace(/\s*-\s*/g, '-');
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

    for (const row of rows) {
        const asn = getColumnValue(row, ['ASN']);
        if (asn && asn.trim() !== '') {
            hasAsn = true;
            break;
        }
    }

    rows.forEach(row => {
        let po = getColumnValue(row, ['PO Number']);
        const bookingNumber = getColumnValue(row, ['Booking Number']);
        
        const asn = getColumnValue(row, ['ASN']);
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

    const res = await fetch(url, {
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
        const auth = new GenerateToken(url);
        const { jwtToken } = await auth.login();
        const svc = new GetAllBookings(url);
        let bookings = await svc.getTodayBookings();

        if (bookings.length === 0) {
            console.log("No bookings found for today.");
            return;
        }

        const bookingDataMap = new Map();

        for (const booking of bookings) {
            const { primeFreightRef, packingList, customer } = booking;
            if (!packingList || !packingList.url) {
                continue;
            }

            let rows;
            let bookingData;

            try {
                rows = await getJSON(packingList.url);
                bookingData = extractBooking(rows);
                if (!bookingData[primeFreightRef] || bookingData[primeFreightRef].poSkuPairs.length === 0) {
                    throw new Error("No valid PO-SKU pairs extracted");
                }
            } catch (e) {
                if (customer && customer.companyName === "George Courey Inc") {
                    try {
                        console.log(`Falling back to Open AI for booking ${primeFreightRef}`);
                        bookingData = await parseXlsWithOpenAi(packingList.url, booking);
                    } catch (fallbackError) {
                        console.log(`Fallback parsing failed for ${primeFreightRef}: ${fallbackError.message}. Skipping...`);
                        continue;
                    }
                } else {
                    continue;
                }
            }

            bookingDataMap.set(primeFreightRef, bookingData[primeFreightRef] || { poSkuPairs: [], totalCBM: 0 });
        }

        if (bookingDataMap.size === 0) {
            console.log("No booking data to process.");
            return;
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
                        }
                    } catch (e) {
                        console.log(`Failed for PO=${pair.orderNumber}, SKU=${pair.styleNumber}: ${e.message}`);
                        continue;
                    }
                }
                processedBookingNos.add(primeFreightRef);
            }
        }
        console.log('Script completed successfully.');
    } catch (err) {
        console.log(`Main error: ${err.message}`);
        return;
    }
}

main();
