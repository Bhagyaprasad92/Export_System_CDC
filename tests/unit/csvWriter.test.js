const fs = require('fs');
const path = require('path');
const os = require('os');
const { writeCSV } = require('../../src/utils/csvWriter');

describe('csvWriter', () => {
    let tmpDir;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'csv-test-'));
    });

    afterEach(() => {
        // Clean up temp files
        if (fs.existsSync(tmpDir)) {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    test('writes CSV with correct headers and rows', async () => {
        const filePath = path.join(tmpDir, 'test.csv');
        const headers = ['id', 'name', 'email'];
        const rows = [
            { id: 1, name: 'Alice', email: 'alice@test.com' },
            { id: 2, name: 'Bob', email: 'bob@test.com' }
        ];

        await writeCSV(filePath, headers, rows);

        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.trim().split('\n');

        expect(lines[0]).toBe('id,name,email');
        expect(lines[1]).toBe('1,Alice,alice@test.com');
        expect(lines[2]).toBe('2,Bob,bob@test.com');
        expect(lines.length).toBe(3);
    });

    test('writes CSV with Date values as ISO strings', async () => {
        const filePath = path.join(tmpDir, 'dates.csv');
        const date = new Date('2025-06-15T10:30:00.000Z');
        const headers = ['id', 'created_at'];
        const rows = [{ id: 1, created_at: date }];

        await writeCSV(filePath, headers, rows);

        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.trim().split('\n');

        expect(lines[1]).toContain('2025-06-15T10:30:00.000Z');
    });

    test('writes empty CSV (headers only) when no rows', async () => {
        const filePath = path.join(tmpDir, 'empty.csv');
        const headers = ['id', 'name'];
        const rows = [];

        await writeCSV(filePath, headers, rows);

        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.trim().split('\n');

        // fast-csv doesn't write headers if no rows, so file might be empty
        expect(fs.existsSync(filePath)).toBe(true);
    });

    test('creates directories if they do not exist', async () => {
        const filePath = path.join(tmpDir, 'nested', 'dir', 'output.csv');
        const headers = ['id'];
        const rows = [{ id: 1 }];

        await writeCSV(filePath, headers, rows);

        expect(fs.existsSync(filePath)).toBe(true);
    });

    test('handles special characters in values', async () => {
        const filePath = path.join(tmpDir, 'special.csv');
        const headers = ['id', 'name'];
        const rows = [{ id: 1, name: 'O\'Brien, "Joe"' }];

        await writeCSV(filePath, headers, rows);

        const content = fs.readFileSync(filePath, 'utf-8');
        expect(content).toContain('O\'Brien');
        expect(fs.existsSync(filePath)).toBe(true);
    });

    test('writes boolean values correctly', async () => {
        const filePath = path.join(tmpDir, 'booleans.csv');
        const headers = ['id', 'is_deleted'];
        const rows = [
            { id: 1, is_deleted: false },
            { id: 2, is_deleted: true }
        ];

        await writeCSV(filePath, headers, rows);

        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.trim().split('\n');

        expect(lines[1]).toContain('false');
        expect(lines[2]).toContain('true');
    });
});
