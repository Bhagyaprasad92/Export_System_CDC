const db = require('../db');

/**
 * Get the watermark for a consumer.
 * @param {string} consumerId
 * @returns {object|null} Watermark record or null
 */
async function getWatermark(consumerId) {
    const result = await db.query(
        'SELECT consumer_id, last_exported_at, updated_at FROM watermarks WHERE consumer_id = $1',
        [consumerId]
    );
    return result.rows[0] || null;
}

/**
 * Upsert (insert or update) the watermark for a consumer.
 * Can accept an optional client for transactional use.
 * @param {string} consumerId
 * @param {Date|string} lastExportedAt
 * @param {object} [client] - Optional pg client for transactions
 */
async function upsertWatermark(consumerId, lastExportedAt, client) {
    const queryFn = client ? client.query.bind(client) : db.query;
    await queryFn(
        `INSERT INTO watermarks (consumer_id, last_exported_at, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (consumer_id)
     DO UPDATE SET last_exported_at = $2, updated_at = NOW()`,
        [consumerId, lastExportedAt]
    );
}

module.exports = { getWatermark, upsertWatermark };
