// 应用中间件
const express = require('express');
const path = require('path');
const config = require('../config/serverConfig');

class AppMiddleware {
    constructor(app) {
        this.app = app;
        this.setupMiddleware();
    }

    setupMiddleware() {
        // JSON 解析中间件
        this.app.use(express.json({ limit: config.middleware.jsonLimit }));

        // URL 编码参数解析中间件
        this.app.use(express.urlencoded({ extended: true, limit: config.middleware.jsonLimit }));

        // 静态文件服务
        this.app.use(express.static(config.server.publicPath));

        // CORS 支持
        this.setupCORS();

        // 主页路由
        this.setupHomeRoute();
    }

    setupCORS() {
        this.app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', config.middleware.cors.origin);
            res.header('Access-Control-Allow-Methods', config.middleware.cors.methods.join(', '));
            res.header('Access-Control-Allow-Headers', config.middleware.cors.headers.join(', '));

            if (req.method === 'OPTIONS') {
                res.sendStatus(200);
                return;
            }
            next();
        });
    }

    setupHomeRoute() {
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(config.server.publicPath, 'index.html'));
        });
    }
}

module.exports = AppMiddleware;
