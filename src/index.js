const express = require('express');
const config = require('./config');
const logger = require('./logger');
const db = require('./db');
const healthRoutes = require('./routes/health');
const exportRoutes = require('./routes/exports');

const app = express();

// Middleware
app.use(express.json());

// Routes
app.use('/', healthRoutes);
app.use('/exports', exportRoutes);

// Global error handler
app.use((err, req, res, next) => {
    logger.error('Unhandled error', { error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
let server;
if (require.main === module) {
    server = app.listen(config.port, () => {
        logger.info(`CDC Export System started`, {
            port: config.port,
            env: config.nodeEnv
        });
    });

    // Graceful shutdown
    const shutdown = async (signal) => {
        logger.info(`Received ${signal}. Shutting down gracefully...`);
        if (server) {
            server.close(async () => {
                await db.closePool();
                logger.info('Server shut down complete');
                process.exit(0);
            });
        }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}

module.exports = app;
