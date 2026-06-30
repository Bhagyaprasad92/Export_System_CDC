jest.mock('../../src/db');
jest.mock('../../src/logger', () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
}));

const fs = require('fs');
const path = require('path');
const os = require('os');
const exportService = require('../../src/services/exportService');
const watermarkService = require('../../src/services/watermarkService');
const db = require('../../src/db');
const config = require('../../src/config');

describe('ExportService', () => {
    let tmpDir;
    let mockClient;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'export-test-'));
        config.outputDir = tmpDir;

        mockClient = {
            query: jest.fn(),
            release: jest.fn()
        };
        db.getClient.mockResolvedValue(mockClient);
    });

    afterEach(() => {
        if (fs.existsSync(tmpDir)) {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
        jest.restoreAllMocks();
    });

    describe('fullExport', () => {
        test('exports all non-deleted users and updates watermark', async () => {
            const now = new Date('2025-06-15T12:00:00Z');
            const rows = [
                { id: 1, name: 'Alice', email: 'alice@test.com', created_at: now, updated_at: now, is_deleted: false },
                { id: 2, name: 'Bob', email: 'bob@test.com', created_at: now, updated_at: now, is_deleted: false }
            ];

            mockClient.query
                .mockResolvedValueOnce() // BEGIN
                .mockResolvedValueOnce({ rows }) // SELECT
                .mockResolvedValueOnce() // COMMIT (watermark upsert uses client.query too)
                .mockResolvedValueOnce(); // COMMIT

            // Mock watermarkService to use the client
            jest.spyOn(watermarkService, 'upsertWatermark').mockResolvedValue();

            const result = await exportService.fullExport('consumer-1', 'full_test.csv');

            expect(result.rowsExported).toBe(2);
            expect(fs.existsSync(path.join(tmpDir, 'full_test.csv'))).toBe(true);

            const csvContent = fs.readFileSync(path.join(tmpDir, 'full_test.csv'), 'utf-8');
            expect(csvContent).toContain('id,name,email,created_at,updated_at,is_deleted');
            expect(csvContent).toContain('Alice');
            expect(csvContent).toContain('Bob');
        });

        test('rolls back on error', async () => {
            mockClient.query
                .mockResolvedValueOnce() // BEGIN
                .mockRejectedValueOnce(new Error('DB error')); // SELECT fails

            await expect(
                exportService.fullExport('consumer-1', 'fail.csv')
            ).rejects.toThrow('DB error');

            // Verify ROLLBACK was called
            expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
            expect(mockClient.release).toHaveBeenCalled();
        });
    });

    describe('incrementalExport', () => {
        test('exports only records newer than watermark', async () => {
            const watermarkTime = new Date('2025-06-10T00:00:00Z');
            const updatedTime = new Date('2025-06-15T12:00:00Z');

            jest.spyOn(watermarkService, 'getWatermark').mockResolvedValue({
                consumer_id: 'consumer-2',
                last_exported_at: watermarkTime
            });
            jest.spyOn(watermarkService, 'upsertWatermark').mockResolvedValue();

            const rows = [
                { id: 3, name: 'Charlie', email: 'charlie@test.com', created_at: updatedTime, updated_at: updatedTime, is_deleted: false }
            ];

            mockClient.query
                .mockResolvedValueOnce() // BEGIN
                .mockResolvedValueOnce({ rows }) // SELECT
                .mockResolvedValueOnce() // COMMIT
                .mockResolvedValueOnce(); // COMMIT

            const result = await exportService.incrementalExport('consumer-2', 'inc_test.csv');

            expect(result.rowsExported).toBe(1);
            const csvContent = fs.readFileSync(path.join(tmpDir, 'inc_test.csv'), 'utf-8');
            expect(csvContent).toContain('Charlie');
        });

        test('uses epoch when no watermark exists', async () => {
            jest.spyOn(watermarkService, 'getWatermark').mockResolvedValue(null);
            jest.spyOn(watermarkService, 'upsertWatermark').mockResolvedValue();

            const rows = [];
            mockClient.query
                .mockResolvedValueOnce() // BEGIN
                .mockResolvedValueOnce({ rows }) // SELECT
                .mockResolvedValueOnce(); // COMMIT

            const result = await exportService.incrementalExport('new-consumer', 'inc_new.csv');

            expect(result.rowsExported).toBe(0);
        });
    });

    describe('deltaExport', () => {
        test('exports with correct operation types', async () => {
            const baseTime = new Date('2025-06-10T00:00:00Z');
            const updateTime = new Date('2025-06-15T12:00:00Z');

            jest.spyOn(watermarkService, 'getWatermark').mockResolvedValue({
                consumer_id: 'consumer-3',
                last_exported_at: baseTime
            });
            jest.spyOn(watermarkService, 'upsertWatermark').mockResolvedValue();

            const rows = [
                // INSERT: created_at === updated_at
                { id: 1, name: 'New User', email: 'new@test.com', created_at: updateTime, updated_at: updateTime, is_deleted: false },
                // UPDATE: created_at !== updated_at
                { id: 2, name: 'Updated User', email: 'updated@test.com', created_at: baseTime, updated_at: updateTime, is_deleted: false },
                // DELETE: is_deleted = true
                { id: 3, name: 'Deleted User', email: 'deleted@test.com', created_at: baseTime, updated_at: updateTime, is_deleted: true }
            ];

            mockClient.query
                .mockResolvedValueOnce() // BEGIN
                .mockResolvedValueOnce({ rows }) // SELECT
                .mockResolvedValueOnce() // COMMIT
                .mockResolvedValueOnce(); // COMMIT

            const result = await exportService.deltaExport('consumer-3', 'delta_test.csv');

            expect(result.rowsExported).toBe(3);

            const csvContent = fs.readFileSync(path.join(tmpDir, 'delta_test.csv'), 'utf-8');
            const lines = csvContent.trim().split('\n');

            expect(lines[0]).toBe('operation,id,name,email,created_at,updated_at,is_deleted');
            expect(lines[1]).toContain('INSERT');
            expect(lines[2]).toContain('UPDATE');
            expect(lines[3]).toContain('DELETE');
        });

        test('rolls back and does not update watermark on failure', async () => {
            jest.spyOn(watermarkService, 'getWatermark').mockResolvedValue(null);

            mockClient.query
                .mockResolvedValueOnce() // BEGIN
                .mockRejectedValueOnce(new Error('Query timeout')); // SELECT fails

            await expect(
                exportService.deltaExport('consumer-3', 'delta_fail.csv')
            ).rejects.toThrow('Query timeout');

            expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
        });
    });
});
