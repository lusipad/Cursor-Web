const config = require('../config');

/**
 * CORS中间件
 * @param {Object} req Express请求对象
 * @param {Object} res Express响应对象
 * @param {Function} next Express下一个中间件函数
 */
function corsMiddleware(req, res, next) {
    res.header('Access-Control-Allow-Origin', config.server.cors.origin);
    res.header('Access-Control-Allow-Methods', config.server.cors.methods.join(', '));
    res.header('Access-Control-Allow-Headers', config.server.cors.headers.join(', '));

    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
        return;
    }
    next();
}

module.exports = corsMiddleware;
