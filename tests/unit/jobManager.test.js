const { startJob, getJob, clearJobs } = require('../../src/services/jobManager');

// Suppress winston logs during tests
jest.mock('../../src/logger', () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
}));

describe('JobManager', () => {
    beforeEach(() => {
        clearJobs();
    });

    test('startJob creates a job with started status', () => {
        const job = startJob('job-1', async () => ({ rowsExported: 10 }), {
            consumerId: 'test',
            exportType: 'full'
        });

        expect(job.jobId).toBe('job-1');
        expect(job.status).toBe('started');
        expect(job.consumerId).toBe('test');
        expect(job.exportType).toBe('full');
        expect(job.startedAt).toBeInstanceOf(Date);
    });

    test('getJob returns the job by ID', () => {
        startJob('job-2', async () => ({}), {});
        const job = getJob('job-2');
        expect(job).not.toBeNull();
        expect(job.jobId).toBe('job-2');
    });

    test('getJob returns null for unknown job', () => {
        expect(getJob('nonexistent')).toBeNull();
    });

    test('job transitions to completed on success', async () => {
        startJob('job-3', async () => ({ rowsExported: 5 }), {
            consumerId: 'c1',
            exportType: 'incremental'
        });

        // Wait for async completion
        await new Promise(resolve => setTimeout(resolve, 100));

        const job = getJob('job-3');
        expect(job.status).toBe('completed');
        expect(job.result).toEqual({ rowsExported: 5 });
        expect(job.completedAt).toBeInstanceOf(Date);
    });

    test('job transitions to failed on error', async () => {
        startJob('job-4', async () => {
            throw new Error('DB connection failed');
        }, { consumerId: 'c2', exportType: 'delta' });

        await new Promise(resolve => setTimeout(resolve, 100));

        const job = getJob('job-4');
        expect(job.status).toBe('failed');
        expect(job.error).toBe('DB connection failed');
        expect(job.completedAt).toBeInstanceOf(Date);
    });

    test('clearJobs removes all jobs', () => {
        startJob('job-5', async () => ({}), {});
        startJob('job-6', async () => ({}), {});
        clearJobs();
        expect(getJob('job-5')).toBeNull();
        expect(getJob('job-6')).toBeNull();
    });
});
