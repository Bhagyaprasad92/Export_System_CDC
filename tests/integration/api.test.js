const request = require('supertest');
const app = require('../../src/index');

// Mock the database module
jest.mock('../../src/db');
jest.mock('../../src/logger', () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
}));

const db = require('../../src/db');

describe('API Integration Tests', () => {
    let mockClient;

    beforeEach(() => {
        mockClient = {
            query: jest.fn(),
            release: jest.fn()
        };
        db.getClient.mockResolvedValue(mockClient);
        db.query.mockReset();
    });

    describe('GET /health', () => {
        test('returns 200 with status ok', async () => {
            const res = await request(app).get('/health');

            expect(res.status).toBe(200);
            expect(res.body.status).toBe('ok');
            expect(res.body.timestamp).toBeDefined();
            // Validate ISO 8601 format
            expect(new Date(res.body.timestamp).toISOString()).toBe(res.body.timestamp);
        });
    });

    describe('POST /exports/full', () => {
        test('returns 202 with job details', async () => {
            // Mock the async export (it runs in background)
            mockClient.query
                .mockResolvedValueOnce() // BEGIN
                .mockResolvedValueOnce({ rows: [] }) // SELECT
                .mockResolvedValueOnce(); // COMMIT

            const res = await request(app)
                .post('/exports/full')
                .set('X-Consumer-ID', 'test-consumer');

            expect(res.status).toBe(202);
            expect(res.body.jobId).toBeDefined();
            expect(res.body.status).toBe('started');
            expect(res.body.exportType).toBe('full');
            expect(res.body.outputFilename).toMatch(/^full_test-consumer_/);
            expect(res.body.outputFilename).toMatch(/\.csv$/);
        });

        test('returns 400 without X-Consumer-ID header', async () => {
            const res = await request(app).post('/exports/full');

            expect(res.status).toBe(400);
            expect(res.body.error).toContain('X-Consumer-ID');
        });
    });

    describe('POST /exports/incremental', () => {
        test('returns 202 with job details', async () => {
            db.query.mockResolvedValue({ rows: [] });
            mockClient.query
                .mockResolvedValueOnce() // BEGIN
                .mockResolvedValueOnce({ rows: [] }) // SELECT
                .mockResolvedValueOnce(); // COMMIT

            const res = await request(app)
                .post('/exports/incremental')
                .set('X-Consumer-ID', 'inc-consumer');

            expect(res.status).toBe(202);
            expect(res.body.exportType).toBe('incremental');
            expect(res.body.outputFilename).toMatch(/^incremental_inc-consumer_/);
        });

        test('returns 400 without X-Consumer-ID header', async () => {
            const res = await request(app).post('/exports/incremental');
            expect(res.status).toBe(400);
        });
    });

    describe('POST /exports/delta', () => {
        test('returns 202 with job details', async () => {
            db.query.mockResolvedValue({ rows: [] });
            mockClient.query
                .mockResolvedValueOnce() // BEGIN
                .mockResolvedValueOnce({ rows: [] }) // SELECT
                .mockResolvedValueOnce(); // COMMIT

            const res = await request(app)
                .post('/exports/delta')
                .set('X-Consumer-ID', 'delta-consumer');

            expect(res.status).toBe(202);
            expect(res.body.exportType).toBe('delta');
            expect(res.body.outputFilename).toMatch(/^delta_delta-consumer_/);
        });

        test('returns 400 without X-Consumer-ID header', async () => {
            const res = await request(app).post('/exports/delta');
            expect(res.status).toBe(400);
        });
    });

    describe('GET /exports/watermark', () => {
        test('returns 200 with watermark when found', async () => {
            const mockDate = new Date('2025-06-15T00:00:00.000Z');
            db.query.mockResolvedValue({
                rows: [{
                    consumer_id: 'wm-consumer',
                    last_exported_at: mockDate,
                    updated_at: mockDate
                }]
            });

            const res = await request(app)
                .get('/exports/watermark')
                .set('X-Consumer-ID', 'wm-consumer');

            expect(res.status).toBe(200);
            expect(res.body.consumerId).toBe('wm-consumer');
            expect(res.body.lastExportedAt).toBe('2025-06-15T00:00:00.000Z');
        });

        test('returns 404 when no watermark exists', async () => {
            db.query.mockResolvedValue({ rows: [] });

            const res = await request(app)
                .get('/exports/watermark')
                .set('X-Consumer-ID', 'unknown-consumer');

            expect(res.status).toBe(404);
            expect(res.body.error).toContain('No watermark found');
        });

        test('returns 400 without X-Consumer-ID header', async () => {
            const res = await request(app).get('/exports/watermark');
            expect(res.status).toBe(400);
        });

        test('returns 500 on database error', async () => {
            db.query.mockRejectedValue(new Error('Connection refused'));

            const res = await request(app)
                .get('/exports/watermark')
                .set('X-Consumer-ID', 'error-consumer');

            expect(res.status).toBe(500);
            expect(res.body.error).toBe('Internal server error');
        });
    });
});
