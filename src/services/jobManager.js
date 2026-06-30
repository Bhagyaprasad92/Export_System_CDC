const logger = require('../logger');

const jobs = new Map();

/**
 * Start an async job and track its lifecycle.
 * @param {string} jobId - Unique job identifier
 * @param {Function} taskFn - Async function to execute
 * @param {object} meta - Metadata (consumerId, exportType)
 * @returns {object} Job record
 */
function startJob(jobId, taskFn, meta = {}) {
    const job = {
        jobId,
        status: 'started',
        startedAt: new Date(),
        completedAt: null,
        result: null,
        error: null,
        ...meta
    };

    jobs.set(jobId, job);

    // Execute asynchronously
    const startTime = Date.now();
    Promise.resolve()
        .then(() => taskFn())
        .then((result) => {
            const duration = Date.now() - startTime;
            job.status = 'completed';
            job.completedAt = new Date();
            job.result = result;

            logger.info('Export job completed', {
                jobId,
                consumerId: meta.consumerId,
                exportType: meta.exportType,
                rowsExported: result?.rowsExported || 0,
                duration: `${duration}ms`
            });
        })
        .catch((err) => {
            const duration = Date.now() - startTime;
            job.status = 'failed';
            job.completedAt = new Date();
            job.error = err.message;

            logger.error('Export job failed', {
                jobId,
                consumerId: meta.consumerId,
                exportType: meta.exportType,
                error: err.message,
                duration: `${duration}ms`
            });
        });

    return job;
}

/**
 * Get job status by ID
 */
function getJob(jobId) {
    return jobs.get(jobId) || null;
}

/**
 * Clear all jobs (for testing)
 */
function clearJobs() {
    jobs.clear();
}

module.exports = { startJob, getJob, clearJobs };
