import { GetAllBookings } from './getAllBookings.js';
import fetch from 'node-fetch';
import XLSX from 'xlsx';

async function getJSON(url){
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`);
    }
    const buffer = await response.arrayBuffer();
    const workbook = XLSX.read(Buffer.from(buffer), {type: 'buffer'});
    const sheet = workbook.SheetNames[0];
    return  XLSX.utils.sheet_to_json(workbook.Sheets[sheet], {defval:null});
    
}

function extractBooking(rows) {
    const poNum = new Set();
    const skuNum = new Set();
    let totalCBM = 0;

    rows.forEach((row, index) => {
        const rowNumber = index + 2;

        const po = row['PO Number'];
        const sku = row['SKU'];
        const total_measurement = row['Booked Measurement'];

        if (!po && !sku ) return;

        //po number
        if (po) {
            poNum.add(String(po).trim());
        }else{
            console.warn(`Row ${rowNumber}: missing PO Number`);
        }

        //sku number
        if (sku) {
            skuNum.add(String(sku).trim());
        }else{
            console.warn(`Row ${rowNumber}: missing SKU `);
        }

        //booked measurement
        if (total_measurement == null || total_measurement == '') {
            console.warn(`Row ${rowNumber}: missing booked measurement `);
        } else {
            const n = Number(total_measurement);
            if (Number.isNaN(n)) {
            console.warn(`Row ${rowNumber}: booked measurement is invalid `);
        } else{
            totalCBM += n;
            }
        }    
    });

    return {
        poNumber: poNum.size === 1 ? [...poNum][0] : [...poNum],
        skuNumber: [...skuNum],
        totalCBM: totalCBM
    }

}


(async () => {
    const endpoint = 'https://primefreight.betty.app/api/runtime/da93364a26fb4eeb9e56351ecec79abb';
    const svc = new GetAllBookings(endpoint);

    const bookings = await svc.getTodayBookings();
    // console.log(bookings);

    const expandData = await Promise.all(bookings.map(async (booking) => {
        let rows = [];
        try  {
            rows = await getJSON(booking.packingList.url);
        } catch (error) {
            console.warn(`Booking ${booking.id} parse failed:`, error.message);
        }

        const summary = extractBooking(rows);
        return {
            summary
        };
    }));

    console.dir(expandData, { depth: null });

  })();
