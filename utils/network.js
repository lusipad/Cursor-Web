const { networkInterfaces } = require('os');

class NetworkUtils {
    /**
     * 获取本机IP地址
     * @returns {string} 本机IP地址
     */
    static getLocalIP() {
        const nets = networkInterfaces();

        for (const name of Object.keys(nets)) {
            for (const net of nets[name]) {
                // 跳过非IPv4和内部地址
                if (net.family === 'IPv4' && !net.internal) {
                    return net.address;
                }
            }
        }
        return 'localhost';
    }

    /**
     * 获取所有网络接口信息
     * @returns {Object} 网络接口信息
     */
    static getAllNetworkInterfaces() {
        return networkInterfaces();
    }

    /**
     * 检查端口是否可用
     * @param {number} port 端口号
     * @returns {Promise<boolean>} 端口是否可用
     */
    static async isPortAvailable(port) {
        return new Promise((resolve) => {
            const net = require('net');
            const server = net.createServer();

            server.listen(port, () => {
                server.once('close', () => {
                    resolve(true);
                });
                server.close();
            });

            server.on('error', () => {
                resolve(false);
            });
        });
    }

    /**
     * 格式化URL
     * @param {string} protocol 协议
     * @param {string} host 主机
     * @param {number} port 端口
     * @param {string} path 路径
     * @returns {string} 格式化后的URL
     */
    static formatURL(protocol, host, port, path = '') {
        const portPart = port ? `:${port}` : '';
        return `${protocol}://${host}${portPart}${path}`;
    }
}

module.exports = NetworkUtils;
