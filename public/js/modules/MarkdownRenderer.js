/**
 * MarkdownRenderer - 统一的 Markdown 渲染与代码高亮工具
 * 目标：
 *  - 仅使用 marked 解析 Markdown（不做正则预处理）
 *  - 统一触发 Prism 高亮，并对带有附加信息的语言类名做规范化
 */
(function(){
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
            if (lang && /[:/]/.test(lang)) { lang = lang.split(/[:/]/)[0]; }
            if (!lang) lang = 'none';
            const rest = classes.filter(c => !c.startsWith('language-'));
            node.className = `language-${lang}` + (rest.length ? ` ${rest.join(' ')}` : '');
          }catch{}
        });
        if (window.Prism && typeof window.Prism.highlightAllUnder === 'function'){
          window.Prism.highlightAllUnder(container);
        }
      }catch{}
    }
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = MarkdownRenderer;
  } else {
    window.MarkdownRenderer = MarkdownRenderer;
  }
})();


