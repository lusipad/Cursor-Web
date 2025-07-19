const config = require('../config');

class Logger {
    constructor() {
        this.timestamp = config.logging.timestamp;
    }

    _formatMessage(level, message, data = null) {
        const timestamp = this.timestamp ? `[${new Date().toISOString()}] ` : '';
        const prefix = `${timestamp}[${level.toUpperCase()}] `;

        if (data) {
            return `${prefix}${message} ${JSON.stringify(data)}`;
        }
        return `${prefix}${message}`;
    }

    info(message, data = null) {
        console.log(this._formatMessage('info', message, data));
    }

    warn(message, data = null) {
        console.log(this._formatMessage('warn', message, data));
    }

    error(message, data = null) {
        console.error(this._formatMessage('error', message, data));
    }

    debug(message, data = null) {
        if (config.logging.level === 'debug') {
            console.log(this._formatMessage('debug', message, data));
        }
    }

    // 特殊格式的日志方法
    success(message, data = null) {
        console.log(`✅ ${this._formatMessage('success', message, data)}`);
    }

    failure(message, data = null) {
        console.log(`❌ ${this._formatMessage('failure', message, data)}`);
    }

    warning(message, data = null) {
        console.log(`⚠️  ${this._formatMessage('warning', message, data)}`);
    }

    info(message, data = null) {
        console.log(`📋 ${this._formatMessage('info', message, data)}`);
    }

    network(message, data = null) {
        console.log(`📡 ${this._formatMessage('network', message, data)}`);
    }

    websocket(message, data = null) {
        console.log(`🔌 ${this._formatMessage('websocket', message, data)}`);
    }

    git(message, data = null) {
        console.log(`🔧 ${this._formatMessage('git', message, data)}`);
    }
}

module.exports = new Logger();
