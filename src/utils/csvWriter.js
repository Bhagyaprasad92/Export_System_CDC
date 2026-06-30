const fs = require('fs');
const path = require('path');
const { format } = require('@fast-csv/format');

/**
 * Write rows to a CSV file.
 * @param {string} filePath - Absolute path to write CSV
 * @param {string[]} headers - Column headers
 * @param {object[]} rows - Array of row objects
 * @returns {Promise<void>}
 */
function writeCSV(filePath, headers, rows) {
    return new Promise((resolve, reject) => {
        // Ensure output directory exists
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        const ws = fs.createWriteStream(filePath);
        const csvStream = format({ headers: true });

        ws.on('error', reject);
        ws.on('finish', resolve);

        csvStream.pipe(ws);

        for (const row of rows) {
            const csvRow = {};
            for (const header of headers) {
                let value = row[header];
                // Format dates as ISO strings
                if (value instanceof Date) {
                    value = value.toISOString();
                }
                csvRow[header] = value;
            }
            csvStream.write(csvRow);
        }

        csvStream.end();
    });
}

module.exports = { writeCSV };
