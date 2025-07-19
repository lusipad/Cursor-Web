/**
 * 错误处理工具
 * 提供统一的错误处理和日志记录功能
 */
class ErrorHandler {
    constructor() {
        this.errorCount = 0;
        this.maxErrors = 10;
        this.errorLog = [];
    }

    /**
     * 处理错误
     */
    handleError(error, context = '') {
        this.errorCount++;

        const errorInfo = {
            timestamp: new Date().toISOString(),
            message: error.message || error,
            stack: error.stack,
            context: context,
            count: this.errorCount
        };

        this.errorLog.push(errorInfo);

        // 限制错误日志大小
        if (this.errorLog.length > 50) {
            this.errorLog.shift();
        }

        // 记录错误
        console.error(`❌ [${context}] 错误 #${this.errorCount}:`, error);

        // 如果错误过多，显示警告
        if (this.errorCount >= this.maxErrors) {
            console.warn('⚠️ 错误次数过多，请检查系统状态');
        }

        return errorInfo;
    }

    /**
     * 处理异步错误
     */
    async handleAsyncError(asyncFunction, context = '') {
        try {
            return await asyncFunction();
        } catch (error) {
            this.handleError(error, context);
            throw error;
        }
    }

    /**
     * 处理Promise错误
     */
    handlePromiseError(promise, context = '') {
        return promise.catch(error => {
            this.handleError(error, context);
            throw error;
        });
    }

    /**
     * 获取错误统计
     */
    getErrorStats() {
        return {
            totalErrors: this.errorCount,
            recentErrors: this.errorLog.length,
            maxErrors: this.maxErrors,
            isHealthy: this.errorCount < this.maxErrors
        };
    }

    /**
     * 获取错误日志
     */
    getErrorLog() {
        return [...this.errorLog];
    }

    /**
     * 清除错误日志
     */
    clearErrorLog() {
        this.errorLog = [];
        this.errorCount = 0;
        console.log('🧹 错误日志已清除');
    }

    /**
     * 设置最大错误数
     */
    setMaxErrors(max) {
        this.maxErrors = max;
    }

    /**
     * 检查系统健康状态
     */
    isHealthy() {
        return this.errorCount < this.maxErrors;
    }
}

// 创建全局错误处理器实例
window.ErrorHandler = new ErrorHandler();

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ErrorHandler;
}
