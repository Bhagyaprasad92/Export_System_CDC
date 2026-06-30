const winston = require('winston');
const config = require('./config');

const logger = winston.createLogger({
    level: config.logLevel,
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
        winston.format.json()
    ),
    defaultMeta: { service: 'cdc-export-system' },
    transports: [
        new winston.transports.Console()
    ]
});

module.exports = logger;
