const path = require('path');
const db = require('../db');
const watermarkService = require('./watermarkService');
const csvWriter = require('../utils/csvWriter');
const config = require('../config');
const logger = require('../logger');

/**
 * Full export: all non-deleted users → CSV.
 * Updates watermark to the max updated_at of exported records.
 */
async function fullExport(consumerId, filename) {
    const filePath = path.join(config.outputDir, filename);
    const client = await db.getClient();

    try {
        await client.query('BEGIN');

        // Query all non-deleted users
        const result = await client.query(
            `SELECT id, name, email, created_at, updated_at, is_deleted
       FROM users
       WHERE is_deleted = FALSE
       ORDER BY updated_at ASC`
        );

        const rows = result.rows;
        const headers = ['id', 'name', 'email', 'created_at', 'updated_at', 'is_deleted'];

        // Write CSV
        await csvWriter.writeCSV(filePath, headers, rows);

        // Update watermark to max updated_at
        if (rows.length > 0) {
            const maxUpdatedAt = rows.reduce((max, row) => {
                const rowDate = new Date(row.updated_at);
                return rowDate > max ? rowDate : max;
            }, new Date(0));

            await watermarkService.upsertWatermark(consumerId, maxUpdatedAt, client);
        }

        await client.query('COMMIT');

        return { rowsExported: rows.length, filePath };
    } catch (err) {
        await client.query('ROLLBACK');
        logger.error('Full export failed', { consumerId, error: err.message });
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Incremental export: rows with updated_at > watermark, excluding deleted.
 * Updates watermark on success.
 */
async function incrementalExport(consumerId, filename) {
    const filePath = path.join(config.outputDir, filename);
    const client = await db.getClient();

    try {
        await client.query('BEGIN');

        // Get current watermark
        const watermark = await watermarkService.getWatermark(consumerId);
        const since = watermark ? watermark.last_exported_at : new Date(0);

        // Query changed, non-deleted users
        const result = await client.query(
            `SELECT id, name, email, created_at, updated_at, is_deleted
       FROM users
       WHERE updated_at > $1 AND is_deleted = FALSE
       ORDER BY updated_at ASC`,
            [since]
        );

        const rows = result.rows;
        const headers = ['id', 'name', 'email', 'created_at', 'updated_at', 'is_deleted'];

        await csvWriter.writeCSV(filePath, headers, rows);

        // Update watermark
        if (rows.length > 0) {
            const maxUpdatedAt = rows.reduce((max, row) => {
                const rowDate = new Date(row.updated_at);
                return rowDate > max ? rowDate : max;
            }, new Date(0));

            await watermarkService.upsertWatermark(consumerId, maxUpdatedAt, client);
        }

        await client.query('COMMIT');

        return { rowsExported: rows.length, filePath };
    } catch (err) {
        await client.query('ROLLBACK');
        logger.error('Incremental export failed', { consumerId, error: err.message });
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Delta export: rows with updated_at > watermark, INCLUDING deleted.
 * Adds an 'operation' column: INSERT | UPDATE | DELETE.
 */
async function deltaExport(consumerId, filename) {
    const filePath = path.join(config.outputDir, filename);
    const client = await db.getClient();

    try {
        await client.query('BEGIN');

        // Get current watermark
        const watermark = await watermarkService.getWatermark(consumerId);
        const since = watermark ? watermark.last_exported_at : new Date(0);

        // Query ALL changed rows (including deleted)
        const result = await client.query(
            `SELECT id, name, email, created_at, updated_at, is_deleted
       FROM users
       WHERE updated_at > $1
       ORDER BY updated_at ASC`,
            [since]
        );

        const rows = result.rows;

        // Add operation column
        const enrichedRows = rows.map(row => {
            let operation;
            if (row.is_deleted) {
                operation = 'DELETE';
            } else if (
                row.created_at instanceof Date && row.updated_at instanceof Date &&
                row.created_at.getTime() === row.updated_at.getTime()
            ) {
                operation = 'INSERT';
            } else if (
                typeof row.created_at === 'string' && typeof row.updated_at === 'string' &&
                row.created_at === row.updated_at
            ) {
                operation = 'INSERT';
            } else {
                operation = 'UPDATE';
            }

            return {
                operation,
                id: row.id,
                name: row.name,
                email: row.email,
                created_at: row.created_at,
                updated_at: row.updated_at,
                is_deleted: row.is_deleted
            };
        });

        const headers = ['operation', 'id', 'name', 'email', 'created_at', 'updated_at', 'is_deleted'];

        await csvWriter.writeCSV(filePath, headers, enrichedRows);

        // Update watermark
        if (rows.length > 0) {
            const maxUpdatedAt = rows.reduce((max, row) => {
                const rowDate = new Date(row.updated_at);
                return rowDate > max ? rowDate : max;
            }, new Date(0));

            await watermarkService.upsertWatermark(consumerId, maxUpdatedAt, client);
        }

        await client.query('COMMIT');

        return { rowsExported: enrichedRows.length, filePath };
    } catch (err) {
        await client.query('ROLLBACK');
        logger.error('Delta export failed', { consumerId, error: err.message });
        throw err;
    } finally {
        client.release();
    }
}

module.exports = { fullExport, incrementalExport, deltaExport };
