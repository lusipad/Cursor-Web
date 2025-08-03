/**
 * 模块加载器
 * 负责按正确顺序加载所有模块
 */

// 模块加载状态
const ModuleLoader = {
    loadedModules: new Set(),
    moduleDependencies: {
        'ErrorHandler': [],
        'WebSocketManager': ['ErrorHandler'],
        'ContentManager': ['ErrorHandler'],
        'StatusManager': ['ErrorHandler'],
        'CursorStatusManager': ['ErrorHandler'],
        'HomePageStatusManager': ['ErrorHandler', 'WebSocketManager', 'CursorStatusManager', 'UIManager'],
        'UIManager': ['ErrorHandler'],
        'EventManager': ['ErrorHandler', 'WebSocketManager', 'ContentManager', 'UIManager'],
        'DebugManager': ['ErrorHandler', 'WebSocketManager', 'ContentManager', 'UIManager'],
        'HistoryApiClient': [],
        'HistoryService': ['HistoryApiClient'],
        'HistoryManager': ['ErrorHandler', 'HistoryApiClient', 'HistoryService'],
        'SimpleWebClient': ['ErrorHandler', 'WebSocketManager', 'ContentManager', 'StatusManager', 'CursorStatusManager', 'HomePageStatusManager', 'UIManager', 'EventManager', 'DebugManager', 'HistoryManager']
    },

    /**
     * 检查模块是否已加载
     */
    isModuleLoaded(moduleName) {
        return this.loadedModules.has(moduleName);
    },

    /**
     * 标记模块为已加载
     */
    markModuleLoaded(moduleName) {
        this.loadedModules.add(moduleName);
        console.log(`✅ 模块 ${moduleName} 已加载`);
    },

    /**
     * 检查模块依赖是否满足
     */
    checkDependencies(moduleName) {
        const dependencies = this.moduleDependencies[moduleName] || [];
        return dependencies.every(dep => this.isModuleLoaded(dep));
    },

    /**
     * 获取模块加载顺序
     */
    getLoadOrder() {
        const order = [];
        const visited = new Set();
        const temp = new Set();

        const visit = (moduleName) => {
            if (temp.has(moduleName)) {
                throw new Error(`循环依赖检测到: ${moduleName}`);
            }
            if (visited.has(moduleName)) {
                return;
            }

            temp.add(moduleName);
            const dependencies = this.moduleDependencies[moduleName] || [];

            for (const dep of dependencies) {
                visit(dep);
            }

            temp.delete(moduleName);
            visited.add(moduleName);
            order.push(moduleName);
        };

        for (const moduleName of Object.keys(this.moduleDependencies)) {
            visit(moduleName);
        }

        return order;
    },

    /**
     * 加载所有模块
     */
    async loadAllModules() {
        console.log('📦 开始加载模块...');

        const loadOrder = this.getLoadOrder();
        console.log('📋 模块加载顺序:', loadOrder);

        for (const moduleName of loadOrder) {
            await this.loadModule(moduleName);
        }

        console.log('✅ 所有模块加载完成');
    },

    /**
     * 加载单个模块
     */
    async loadModule(moduleName) {
        if (this.isModuleLoaded(moduleName)) {
            return;
        }

        // 检查依赖
        if (!this.checkDependencies(moduleName)) {
            console.warn(`⚠️ 模块 ${moduleName} 的依赖未满足，跳过加载`);
            return;
        }

        try {
            const script = document.createElement('script');

            // SimpleWebClient 在 js 目录下，其他模块在 js/modules 目录下
            if (moduleName === 'SimpleWebClient') {
                script.src = `js/${moduleName}.js`;
            } else {
                script.src = `js/modules/${moduleName}.js`;
            }

            script.async = false; // 确保按顺序加载

            await new Promise((resolve, reject) => {
                script.onload = () => {
                    this.markModuleLoaded(moduleName);
                    resolve();
                };
                script.onerror = () => {
                    reject(new Error(`加载模块 ${moduleName} 失败`));
                };
                document.head.appendChild(script);
            });

        } catch (error) {
            console.error(`❌ 加载模块 ${moduleName} 失败:`, error);
            throw error;
        }
    },

    /**
     * 检查所有模块是否可用
     */
    checkModulesAvailability() {
        const requiredModules = [
            'ErrorHandler',
            'WebSocketManager',
            'ContentManager',
            'StatusManager',
            'CursorStatusManager',
            'HomePageStatusManager',
            'UIManager',
            'EventManager',
            'DebugManager',
            'HistoryApiClient',
            'HistoryService',

            'HistoryManager',
            'SimpleWebClient'
        ];

        const missingModules = requiredModules.filter(module => {
            return !window[module];
        });

        if (missingModules.length > 0) {
            console.error('❌ 缺少必要模块:', missingModules);
            return false;
        }

        console.log('✅ 所有必要模块已可用');
        return true;
    },

    /**
     * 获取加载状态
     */
    getLoadStatus() {
        return {
            loadedModules: Array.from(this.loadedModules),
            totalModules: Object.keys(this.moduleDependencies).length,
            isComplete: this.loadedModules.size === Object.keys(this.moduleDependencies).length
        };
    }
};

// 自动加载模块
function startModuleLoading() {
    console.log('🚀 开始自动加载模块...');
    ModuleLoader.loadAllModules().then(() => {
        console.log('✅ 模块加载完成，检查可用性...');
        if (ModuleLoader.checkModulesAvailability()) {
            console.log('✅ 所有模块可用，加载主客户端...');
            // 加载主客户端
            ModuleLoader.loadModule('SimpleWebClient').then(() => {
                console.log('✅ SimpleWebClient 加载完成');
                // 初始化客户端（仅在主页面时，排除诊断页面和测试页面）
                if (window.SimpleWebClient && !window.simpleClient &&
                    !window.location.pathname.includes('diagnostic') &&
                    !window.location.pathname.includes('connection-test') &&
                    !window.location.pathname.includes('test-')) {
                    console.log('🚀 初始化 SimpleWebClient...');
                    window.simpleClient = new window.SimpleWebClient();
                }
            }).catch(error => {
                console.error('❌ SimpleWebClient 加载失败:', error);
            });
        } else {
            console.error('❌ 部分模块不可用');
        }
    }).catch(error => {
        console.error('❌ 模块加载失败:', error);
    });
}

// 确保在DOM准备好后开始加载
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startModuleLoading);
} else {
    // 如果DOM已经加载完成，延迟一点再开始加载
    setTimeout(startModuleLoading, 100);
}

// 导出模块加载器
window.ModuleLoader = ModuleLoader;
