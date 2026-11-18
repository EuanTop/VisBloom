export const publicPortal = import.meta.env.MODE === 'public-portal';
export const agentSetup = publicPortal ? '/help/agent-setup.html?lang=zh' : '/help/agent-setup.html';
export const portalHome = publicPortal ? '/' : '/portal.html';
export const createLink = publicPortal ? agentSetup : '/';
export const createLabel = publicPortal ? '用 Agent 开始创作' : '打开工作台';
export const projectRepository = 'https://github.com/EuanTop/VisBloom';
