const express = require('express');
const path = require('path');
const fs = require('fs');
const config = require('../config/serverConfig');

class DocsRoutes {
    constructor() {
        this.router = express.Router();
        this.setupRoutes();
    }

    setupRoutes() {
        // 文档列表
        this.router.get('/', this.getDocsList.bind(this));
        
        // 获取特定文档
        this.router.get('/:filename', this.getDoc.bind(this));
    }

    async getDocsList(req, res) {
        try {
            const docsPath = config.paths.docs;
            console.log('📚 文档路径:', docsPath);
            
            if (!fs.existsSync(docsPath)) {
                return res.status(404).json({ 
                    error: '文档目录不存在',
                    path: docsPath 
                });
            }

            const files = fs.readdirSync(docsPath)
                .filter(file => file.endsWith('.md'))
                .map(file => ({
                    name: file,
                    title: file.replace('.md', '').replace(/[-_]/g, ' '),
                    url: `/docs/${file}`
                }));

            res.json({
                success: true,
                docs: files,
                path: docsPath
            });
        } catch (error) {
            console.error('获取文档列表失败:', error);
            res.status(500).json({ 
                error: '获取文档列表失败',
                message: error.message 
            });
        }
    }

    async getDoc(req, res) {
        try {
            const filename = req.params.filename;
            const docsPath = config.paths.docs;
            const filePath = path.join(docsPath, filename);
            
            console.log('📖 请求文档:', filename, '路径:', filePath);

            if (!fs.existsSync(filePath)) {
                return res.status(404).json({ 
                    error: '文档不存在',
                    filename: filename,
                    path: filePath
                });
            }

            const content = fs.readFileSync(filePath, 'utf8');
            
            // 如果是Markdown文件，返回JSON格式
            if (filename.endsWith('.md')) {
                res.json({
                    success: true,
                    filename: filename,
                    content: content,
                    type: 'markdown'
                });
            } else {
                // 其他文件直接返回内容
                res.type(path.extname(filename)).send(content);
            }
        } catch (error) {
            console.error('获取文档失败:', error);
            res.status(500).json({ 
                error: '获取文档失败',
                message: error.message 
            });
        }
    }

    getRouter() {
        return this.router;
    }
}

module.exports = DocsRoutes;