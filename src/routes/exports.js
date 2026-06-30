const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const exportService = require('../services/exportService');
const watermarkService = require('../services/watermarkService');
const jobManager = require('../services/jobManager');
const logger = require('../logger');

// Middleware: validate X-Consumer-ID header
function requireConsumerId(req, res, next) {
    const consumerId = req.headers['x-consumer-id'];
    if (!consumerId || consumerId.trim() === '') {
        return res.status(400).json({
            error: 'Missing required header: X-Consumer-ID'
        });
    }
    req.consumerId = consumerId.trim();
    next();
}

// POST /exports/full
router.post('/full', requireConsumerId, (req, res) => {
    const consumerId = req.consumerId;
    const jobId = uuidv4();
    const timestamp = Date.now();
    const outputFilename = `full_${consumerId}_${timestamp}.csv`;

    const job = jobManager.startJob(jobId, async () => {
        return exportService.fullExport(consumerId, outputFilename);
    }, { consumerId, exportType: 'full' });

    logger.info('Export job started', {
        jobId,
        consumerId,
        exportType: 'full'
    });

    res.status(202).json({
        jobId,
        status: 'started',
        exportType: 'full',
        outputFilename
    });
});

// POST /exports/incremental
router.post('/incremental', requireConsumerId, (req, res) => {
    const consumerId = req.consumerId;
    const jobId = uuidv4();
    const timestamp = Date.now();
    const outputFilename = `incremental_${consumerId}_${timestamp}.csv`;

    const job = jobManager.startJob(jobId, async () => {
        return exportService.incrementalExport(consumerId, outputFilename);
    }, { consumerId, exportType: 'incremental' });

    logger.info('Export job started', {
        jobId,
        consumerId,
        exportType: 'incremental'
    });

    res.status(202).json({
        jobId,
        status: 'started',
        exportType: 'incremental',
        outputFilename
    });
});

// POST /exports/delta
router.post('/delta', requireConsumerId, (req, res) => {
    const consumerId = req.consumerId;
    const jobId = uuidv4();
    const timestamp = Date.now();
    const outputFilename = `delta_${consumerId}_${timestamp}.csv`;

    const job = jobManager.startJob(jobId, async () => {
        return exportService.deltaExport(consumerId, outputFilename);
    }, { consumerId, exportType: 'delta' });

    logger.info('Export job started', {
        jobId,
        consumerId,
        exportType: 'delta'
    });

    res.status(202).json({
        jobId,
        status: 'started',
        exportType: 'delta',
        outputFilename
    });
});

// GET /exports/watermark
router.get('/watermark', requireConsumerId, async (req, res) => {
    try {
        const watermark = await watermarkService.getWatermark(req.consumerId);
        if (!watermark) {
            return res.status(404).json({
                error: `No watermark found for consumer: ${req.consumerId}`
            });
        }
        res.status(200).json({
            consumerId: watermark.consumer_id,
            lastExportedAt: watermark.last_exported_at.toISOString()
        });
    } catch (err) {
        logger.error('Failed to retrieve watermark', {
            consumerId: req.consumerId,
            error: err.message
        });
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
