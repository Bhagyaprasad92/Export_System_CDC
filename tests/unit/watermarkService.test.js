jest.mock('../../src/db');
jest.mock('../../src/logger', () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
}));

const watermarkService = require('../../src/services/watermarkService');
const db = require('../../src/db');

describe('WatermarkService', () => {
    afterEach(() => {
        jest.restoreAllMocks();
        db.query.mockReset();
    });

    describe('getWatermark', () => {
        test('returns watermark when found', async () => {
            const mockWatermark = {
                consumer_id: 'consumer-1',
                last_exported_at: new Date('2025-01-01T00:00:00Z'),
                updated_at: new Date('2025-01-01T00:00:00Z')
            };
            db.query.mockResolvedValue({ rows: [mockWatermark] });

            const result = await watermarkService.getWatermark('consumer-1');

            expect(result).toEqual(mockWatermark);
            expect(db.query).toHaveBeenCalledWith(
                expect.stringContaining('SELECT'),
                ['consumer-1']
            );
        });

        test('returns null when not found', async () => {
            db.query.mockResolvedValue({ rows: [] });

            const result = await watermarkService.getWatermark('unknown');

            expect(result).toBeNull();
        });
    });

    describe('upsertWatermark', () => {
        test('upserts watermark using db.query when no client provided', async () => {
            db.query.mockResolvedValue({ rows: [] });

            await watermarkService.upsertWatermark(
                'consumer-1',
                new Date('2025-06-15T00:00:00Z')
            );

            expect(db.query).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO watermarks'),
                ['consumer-1', new Date('2025-06-15T00:00:00Z')]
            );
        });

        test('upserts watermark using provided client for transactions', async () => {
            const mockClient = {
                query: jest.fn().mockResolvedValue({ rows: [] })
            };

            await watermarkService.upsertWatermark(
                'consumer-2',
                new Date('2025-06-15T00:00:00Z'),
                mockClient
            );

            expect(mockClient.query).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO watermarks'),
                ['consumer-2', new Date('2025-06-15T00:00:00Z')]
            );
            // db.query should NOT have been called
            expect(db.query).not.toHaveBeenCalled();
        });
    });
});
