# 自己的 Agent，自己的创作服务

Visloom 的网页界面可以作为静态文件托管。网页不内置 Agent，也不代管 AI 模型密钥；创作者继续在已有的 Agent 中使用项目 Skill / CLI。AVA、项目文件、编译和保存留在创作者自己运行的工作台服务中。

公共作品与 Agent 安装入口位于 [Visloom 门户](https://artwork.euantop.work/)。以下说明本机创作服务和可选的自托管方式。

## 方式一：全部在本机运行

使用满足 `package.json` engines 的 Node.js，进入仓库后执行：

```sh
npm ci
npm run dev
```

打开 `http://127.0.0.1:4318`。服务默认只监听 `127.0.0.1`；本机网页默认连接当前地址，不需要填写服务信息。Agent 在同一台机器上通过项目 CLI 使用该服务，操作相同的项目、数据和修改记录。项目数据默认保存在 `.art-workbench`，也可用 `ART_WORKBENCH_DIR` 指向自己的目录。

本机使用已构建界面：

```sh
npm run build
npm start
```

`npm start` 仍然需要 Node.js 和服务依赖。静态界面不能独立执行 AVA、读写本机项目或代替 Agent。

## 方式二：静态网页连接每位创作者自己的服务

执行 `npm ci`、`npm run build`，将 `dist/workbench` 的静态文件部署到站点根目录。`index.html` 是工作台，`portal.html` 是介绍门户。使用 HTTPS 托管，保留生成的 assets 文件；当前构建默认以站点根目录为资源路径。

假设静态网页来源是 `https://art.example`，创作者先在自己的机器启动服务：

```sh
ART_ALLOWED_ORIGINS=https://art.example ART_API_TOKEN='<your-service-token>' npm run dev
```

`ART_API_TOKEN` 是该创作服务的访问口令，与 AI 模型密钥无关。请自行设置足够长、随机的口令，不要把实际口令提交到仓库、放到网页源码、公开链接或构建变量中。使用口令后，同源网页、CLI 和其他客户端也需要携带它；CLI 请使用同一会话中的服务认证配置。

在网页的「创作服务」中填入 `http://127.0.0.1:4318` 和服务口令，选择「测试并连接」。网页先调用该地址的 `/api/bootstrap`，确认服务兼容后才切换连接。每位创作者连接的是自己的服务，静态站点本身没有所有人的项目数据库。

服务地址和口令只保留在当前标签页的 `sessionStorage`；浏览器禁用该存储时只在内存保留。「断开」停止连接并清除口令，「重置」清除显式配置（本机网页恢复当前地址）。口令不进入 URL、作品源码、导出文件或服务响应。不要与不可信的人共用已连接的浏览器标签页。

HTTPS 网站访问 HTTP 本机服务可能受浏览器的混合内容规则、本地网络访问权限、企业策略或扩展限制。并非所有浏览器和设置都能工作；允许网页访问本地网络后重试，或改用由自己控制、证书有效的 HTTPS 服务，也可以使用方式一的本机界面。不要通过关闭浏览器安全功能解决连接问题。页面无法连接时，检查服务是否运行、填写的来源是否完全一致，以及浏览器是否阻止本地网络访问。

## 方式三：自己托管可访问的 HTTPS 服务

该工作台是单个创作者或受信任使用者的项目服务，没有云账号、租户隔离或匿名多人编辑能力。给服务口令就等于授予其项目 API 的读写权限。需要自己的访问控制、备份和 HTTPS；不要把它当作公共匿名创作后端。

以下环境变量用于明确允许的入口：

| 配置 | 用途 |
| --- | --- |
| `PORT` | 服务监听端口，默认 `4318` |
| `ART_HOST` | 默认 `127.0.0.1`；显式设置后才能监听其他网卡 |
| `ART_API_TOKEN` | 服务访问口令；所有 API 和作品事件连接均需验证 |
| `ART_ALLOWED_ORIGINS` | 允许连接的网页的精确来源，多个以逗号分隔，例如 `https://art.example,https://another.example` |
| `ART_PUBLIC_ORIGIN` | 反向代理使用的服务来源，例如 `https://service.example`；非本机监听时必须显式设置 |

来源只能是完整的 `http(s)://主机[:端口]`，不包含路径、尾部 `/`、用户名或通配符。不允许 `*` 或 `null`。允许外部来源或非本机入口时，必须同时设置口令；缺少配置时服务拒绝启动。

例如，在由自己管理的 TLS 代理后运行：

```sh
ART_HOST=0.0.0.0 ART_PUBLIC_ORIGIN=https://service.example ART_ALLOWED_ORIGINS=https://art.example ART_API_TOKEN='<your-service-token>' npm start
```

代理需要保留原始 `Host: service.example`，将 `/api/` 请求和 `/events` 的 WebSocket 升级转发到该实例。服务不信任 `Forwarded` / `X-Forwarded-Host` 来扩大允许的主机；不转发正确的 Host 会被拒绝。外部流量必须通过 HTTPS/WSS，内部明文服务端口请通过网络规则限制到代理。网页连接地址填写 `https://service.example`。本示例不替你配置 TLS、DNS 或代理。

可选的公开只读作品网站应单独部署：导出的独立 Web 作品可放在静态主机上。它与有编辑能力的项目 API 是两个入口；公开观看不需要发布服务口令。不要为了公开观看而给可编辑服务打开匿名跨域权限。

## 接入约定与安全检查

浏览器请求只接受 `/api/...` 相对路径，解析到当前配置的服务；不允许将任意 URL 交给带认证的请求函数。认证使用 `Authorization: Bearer …`；请求拒绝跳转，防止认证请求在地址重定向后继续执行。图片预览和下载也需要通过带认证的请求读取 blob，再创建临时 object URL，不能把口令塞进图片或下载 URL。

跨来源 API 请求必须同时满足：请求 Host 被允许、网页 Origin 精确匹配允许列表、口令正确。预检允许对应的 `Authorization`、`Content-Type` 和 `X-Art-Actor` 请求头；预检本身不携带口令，之后的实际请求仍然必须认证。不使用通配符 CORS，不开放 cookie 认证。

浏览器 WebSocket 不支持自定义 Authorization 请求头，事件连接使用子协议：

```ts
new WebSocket(eventsURL(), eventsProtocols());
// ['art-events', 'bearer.' + base64url(UTF8(serviceToken))]
```

Base64url 只是编码，不是加密；远程事件连接必须使用 WSS。服务在升级前验证 Host、Origin 和口令，只在升级响应中选择公开的 `art-events` 协议，不回显 `bearer.*`。代理和诊断工具不应记录 `Authorization` 或完整 `Sec-WebSocket-Protocol` 请求头。拒绝在 `/events` 查询参数中传口令。

服务器的组合入口按以下顺序接入（路由和事件处理保持原有职责）：

```ts
const access = serviceAccessFromEnv(port);
app.use('/api/*', access.middleware); // 注册在业务路由之前
const wss = new WebSocketServer({
  noServer: true,
  handleProtocols: access.websocketProtocols,
});
server.on('upgrade', (req, socket, head) => {
  if (!req.url?.startsWith('/events')) return; // 保留其他开发服务的升级处理
  if (!access.authorizeWebSocket(req).ok) { socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
});
```

`serviceAccessFromEnv` 验证环境配置并返回 Hono 中间件与事件校验函数。监听地址应使用同一 `ART_HOST` 配置。浏览器连接变更可用 `subscribeConnection` 订阅；工作台应关闭旧连接、清除旧项目状态，再从新服务读取项目，避免把旧服务的未提交操作发送给新服务。

运行 `npx vitest run tests/service-access.test.ts` 检查真实 Hono 请求的同源/跨源访问、认证、预检、主机限制、事件认证和浏览器地址处理。这些测试不代表某个公共站点或浏览器网络权限已经实际部署验收。

## 发布到作者自己的 GitHub Pages

从确认的版本生成发布目录。

```sh
npm run --silent visloom -- pages --project PROJECT_ID --revision REVISION --out NEW_DIRECTORY
```

目录内的 `index.html`、小写 `cover.jpg` 和 `.nojekyll` 一起提交到该作品的 GitHub Pages 发布目录。默认打开该版本导出的独立页面，等待画面和字体就绪后以 1200 × 900 截图。缺少截图浏览器时运行 `npm exec playwright install chromium`。作者指定镜头或构图时加 `--cover /path/to/chosen.jpg`，建议准备 4:3 的 JPEG。上传前确认 HTML 公开的数据和封面构图。

作品在 GitHub Pages 上线后，作者可以向 VisBloom 仓库提交 PR，在 [`cases/collection-external.json`](../cases/collection-external.json) 增加作品名 `title`、作者 `author`、公开作品链接 `url` 和可选简介 `description`。维护者也可以直接登记。平台合并并重新部署后，作品会出现在作品集。作品集从该页面同目录加载 `cover.jpg`，封面缺失时显示作品名与作者，点击始终打开作者的页面。对外收录可使用作品专用的封面，首页可独立选图。文件发布与相对路径见 [GitHub Pages 配置](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)。

## 独立作品集与公开分享服务

`npm run build:portal` 同时生成公开作品集 `collection.html` 和供 Agent 读取的 `collection.json`。两者使用同一批公开作品，提交社区作品时建议在 `description` 描述可观察的画面、动效或声画手法。重新构建并发布门户后，Agent 可读取更新后的索引。索引字段仅包含公开标题、作者、页面链接和可选描述。

完整构建生成 `collection.html` 和作品集内各作品的独立 HTML。作品集按案例配置选用封面；公开构建可使用与公开数据范围相符的封面。Martover 的作品入口由火星球体开始，作品集取用其首屏。构建作品时由 AVA 读取案例数据。

工作台「分享」或 `art share create --project ID --revision N` 创建冻结版本，返回观看与嵌入URL；list列出自己的链接，revoke撤回一个明确ID。默认发布适配器返回127.0.0.1本机链接，这不是互联网部署。链接保存在发布目录，重启后保留；作者之后的编辑不会改变该快照，重新发布产生新链接。

需要互联网链接时，先在自己的公开主机运行独立分享服务，在HTTPS代理后配置：

```sh
SHARE_HOST=0.0.0.0 SHARE_PORT=4320 ART_SHARE_PUBLIC_ORIGIN=https://works.example ART_SHARE_DIR=/persistent/artwork-shares ART_SHARE_PUBLISH_TOKEN='<publishing-token-at-least-24-characters>' npm run share:serve
```

代理将该站请求转发到分享服务，保留持久化目录并备份；它只有观看页面、健康检查和经认证的发布/撤回API，没有创作服务的编辑接口。然后在个人创作服务端配置：

```sh
ART_SHARE_URL=https://works.example ART_SHARE_PUBLISH_TOKEN='<same-publishing-token>' npm start
```

发布口令只放在个人服务端，不放入静态前端、分享链接、浏览器会话或作品文件。分享服务另为每个作品生成随机撤回凭据，只返回一次并由个人服务私下保存；共享上传口令不等于拥有其他链接的撤回权限。发布端当前为配置口令的受信任使用者，不是已提供注册/配额/滥用治理的匿名公共投稿系统。不要把发布口令作为公开网站的构建变量。

公开观看页面在独立沙箱中运行作品脚本，禁止网络连接、表单和向顶层跳转。作品需自包含所用数据和素材；依赖外部运行服务的任意页面不能保证可分享。分享结果包含所选数据行，作者应在点击分享时选择准备公开的作品版本；不包含手记、事件历史、源文件或数据集元数据。撤回使服务器后续请求失效，不能收回观看者已经保存的内容。

「嵌入其他页面」提供iframe代码；观众可继续选星、拖动或改时间，调整只在其观看会话中，不修改作者项目。嵌入也不需要服务口令。作品HTML同时可以下载，分享链接是独立的inline观看入口。
