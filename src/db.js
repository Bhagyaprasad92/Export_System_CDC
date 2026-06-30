const { Pool } = require('pg');
const config = require('./config');
const logger = require('./logger');

let pool = null;

function getPool() {
    if (!pool) {
        pool = new Pool({
            connectionString: config.databaseUrl,
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 10000
        });

        pool.on('error', (err) => {
            logger.error('Unexpected pool error', { error: err.message });
        });
    }
    return pool;
}

async function query(text, params) {
    const client = await getPool().connect();
    try {
        const result = await client.query(text, params);
        return result;
    } finally {
        client.release();
    }
}

async function getClient() {
    return getPool().connect();
}

async function closePool() {
    if (pool) {
        await pool.end();
        pool = null;
    }
}

// Allow injecting a custom pool for testing
function setPool(customPool) {
    pool = customPool;
}

module.exports = { query, getClient, closePool, getPool, setPool };
