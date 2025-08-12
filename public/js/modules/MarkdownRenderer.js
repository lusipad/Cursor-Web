/**
 * MarkdownRenderer - 统一的 Markdown 渲染与代码高亮工具
 * 目标：
 *  - 仅使用 marked 解析 Markdown（不做正则预处理）
 *  - 统一触发 Prism 高亮，并对带有附加信息的语言类名做规范化
 */
(function(){
  // 统一的语言规范化，兼容 Prism 的语法名称
  function normalizeLanguageName(raw){
    try{
      let lang = String(raw || '').trim().toLowerCase();
      if (!lang) return '';
      // 去掉类似 csharp:test.cs / ts/app.ts 这类附加信息
      if (/[:/]/.test(lang)) lang = lang.split(/[:/]/)[0];
      // 常见别名映射到 Prism 的标准名称
      const aliasMap = {
        'c#': 'csharp',
        'cs': 'csharp',
        'csharp': 'csharp',
        'c++': 'cpp',
        'cpp': 'cpp',
        'c': 'c',
        'ts': 'typescript',
        'tsx': 'typescript',
        'js': 'javascript',
        'jsx': 'javascript',
        'py': 'python',
        'shell': 'bash',
        'sh': 'bash',
        'bash': 'bash',
        'md': 'markdown',
        'html': 'markup',
        'xml': 'markup'
      };
      return aliasMap[lang] || lang;
    }catch{ return String(raw||''); }
  }

  const MarkdownRenderer = {
    /**
     * 将 Markdown 文本转换为 HTML 字符串
     * @param {string} markdown - 原始 Markdown
     * @param {{breaks?: boolean}} options
     * @returns {string}
     */
    renderMarkdown(markdown, options = {}){
      try{
        const src = String(markdown || '');
        if (window.marked && typeof window.marked.parse === 'function'){
          window.marked.setOptions({
            gfm: true,
            breaks: !!options.breaks,
            mangle: false,
            headerIds: false
          });
          return window.marked.parse(src);
        }
        // 兜底：纯文本
        const div = document.createElement('div');
        div.textContent = src;
        return div.innerHTML;
      }catch{ return ''; }
    },

    /**
     * 在容器内执行 Prism 高亮，并规范化语言类名（处理 language-cpp:test.cpp → language-cpp）
     * @param {HTMLElement} container
     */
    highlight(container){
      try{
        if (!container) return;
        const nodes = container.querySelectorAll('pre code');
        nodes.forEach(node => {
          try{
            const classes = String(node.className || '').split(/\s+/).filter(Boolean);
            const langClass = classes.find(c => c.startsWith('language-')) || '';
            let lang = langClass ? langClass.replace(/^language-/, '') : '';
            lang = normalizeLanguageName(lang);
            if (!lang) lang = 'none';
            const rest = classes.filter(c => !c.startsWith('language-'));
            node.className = `language-${lang}` + (rest.length ? ` ${rest.join(' ')}` : '');
          }catch{}
        });
        // 不使用 Prism：仅规范化类名，交由浏览器默认样式渲染
      }catch{}
    },

    normalizeLanguage: normalizeLanguageName
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = MarkdownRenderer;
  } else {
    window.MarkdownRenderer = MarkdownRenderer;
  }
})();


