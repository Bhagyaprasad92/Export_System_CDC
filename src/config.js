const config = {
    databaseUrl: process.env.DATABASE_URL || 'postgresql://user:password@localhost:5433/mydatabase',
    port: parseInt(process.env.PORT, 10) || 8080,
    nodeEnv: process.env.NODE_ENV || 'development',
    logLevel: process.env.LOG_LEVEL || 'info',
    outputDir: process.env.OUTPUT_DIR || '/app/output'
};

module.exports = config;
