const selectedLanguage = new URLSearchParams(location.search).get('lang');
const isChinese = selectedLanguage === 'zh' ||
  (selectedLanguage !== 'en' && /^zh(?:-|$)/i.test(navigator.language));
const prompt = document.getElementById('starter-prompt');
const copy = document.getElementById('copy-prompt');
const status = document.getElementById('copy-status');

if (isChinese) {
  document.documentElement.lang = 'zh-CN';
  document.title = '用你的 Agent 创作 · Visloom';
  const translations = {
    gallery: '作品集 ↗',
    heading: '用你的 Agent 创作',
    instruction: '请使用能在你电脑上运行命令的编程 Agent。本机工具包适用于 macOS 和 Linux，需要 Node.js 22.13 或更高版本。',
    'paste-heading': '把提示词发给你的 Agent',
    'paste-detail': '粘贴到一段新对话里。可以加上你的创作想法或本机数据路径，也可以用内置观测数据起步。',
    'starter-prompt': '请读取 https://visloom.euantop.work/skills/visloom/SKILL.md，帮我做第一件交互作品。先使用已有的 Visloom，或帮我在本机启动。问我想做什么。如果我还没想法，就从内置的黏菌观测数据开始。做好初稿后，帮我在本机工作台打开它。',
    'copy-prompt': '复制提示词',
    'preview-heading': '打开作品初稿',
    'preview-detail': '打开 Agent 给你的工作台链接，试试作品的控件，或回到对话里告诉 Agent 想改什么。本机工作台无需注册。',
    'export-heading': '导出并分享成稿',
    'export-detail': '成稿可以导出为交互 HTML。如果你需要公开链接，可以请 Agent 协助发布到自己的 GitHub Pages。',
    'download-heading': '自己安装本机工具包',
    'open-skill': '查看 Skill ↗',
    'download-skill': '下载 Skill',
    'download-kit': '下载本机工具包',
  };
  for (const [id, translation] of Object.entries(translations)) {
    document.getElementById(id).textContent = translation;
  }
  document.getElementById('download-detail').innerHTML =
    '下载并解压工具包，在解压后的目录中依次运行 <code>npm ci</code> 和 <code>npm start</code>，然后打开 <a href="http://127.0.0.1:4318/">127.0.0.1:4318</a>。';
}
document.querySelector(isChinese ? '[href="?lang=zh"]' : '[href="?lang=en"]').setAttribute('aria-current', 'true');

if (navigator.clipboard) {
  copy.hidden = false;
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(prompt.textContent.trim());
      status.textContent = isChinese ? '已复制' : 'Copied';
    } catch {
      status.textContent = isChinese ? '请选中文字手动复制。' : 'Select the prompt to copy it manually.';
    }
  });
}
