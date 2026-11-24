# CLI 创作入口

在工程根目录使用 `npm run --silent visbloom -- …`。默认输出 JSON，`--json` 可显式指定相同格式。`--help` 与每个命令的 `--help` 均可离线使用。

```sh
npm run --silent visbloom -- --help
npm run --silent visbloom -- projects
npm run --silent visbloom -- cases
npm run --silent visbloom -- create --name '空白作品' --preset blank
npm run --silent visbloom -- create --name '我的作品' --preset skinbloom
npm run --silent visbloom -- context --project PROJECT_ID
```

服务默认 `http://127.0.0.1:4318`，可通过 `ART_WORKBENCH_URL` 指向另一处本机服务。省略 `--project` 时选最近更新的项目；连续创作建议始终提供明确 ID。

创作时可用 `references find --query '光随曲面变化'` 查本地作品和技法，或用 `references show --id electronic-sheep` 读取一条。结果提供原作者和原作链接，已归档的源码附使用许可。两个命令都可离线运行。

## 先读概况，再按需取内容

`context` 默认读取紧凑概况：状态、参数声明、文件路径/hash/字节数、数据字段、最多 5 行样本、最近 20 条事件及检查点元数据。完整源码、全部数据和检查点快照不会默认输出。

```sh
npm run --silent visbloom -- context --project PROJECT_ID --out context.json
npm run --silent visbloom -- context --project PROJECT_ID --after EVENT_CURSOR --limit 20
npm run --silent visbloom -- file --project PROJECT_ID --path src/artwork.ts
npm run --silent visbloom -- file --project PROJECT_ID --path src/artwork.ts --out artwork.ts
npm run --silent visbloom -- result --project PROJECT_ID --offset 0 --limit 20
npm run --silent visbloom -- notes --project PROJECT_ID --out notes.md
npm run --silent visbloom -- checkpoints --project PROJECT_ID
```

首次 `context` 不必传 `--after`，会返回最新事件；后续使用返回的 `eventCursor` 读取增量，并检查 `hasMoreEvents`。只有明确需要全部上下文时才使用 `context --full`，它可能输出大量源码、数据与历史快照。

## 明确版本再修改

所有需要版本保护的写入都必须提供真实 `--revision`，或 JSON 中的 `expectedRevision`。不自动读取并套用新版本，不猜测文件 hash，不自动覆盖冲突。写入成功只返回项目 ID、revision、hash 与数据引用等简短信息。

`patch.json`：

```json
{"patch":{"parameters":{"speed":0.7}}}
```

```sh
npm run --silent visbloom -- patch --project PROJECT_ID --revision REVISION --input patch.json
npm run --silent visbloom -- notes --project PROJECT_ID --revision REVISION --file notes.md
```

源码修改用 manifest。例如 `edits/changes.json`：

```json
{
  "expectedRevision": 3,
  "files": [
    {
      "path": "src/artwork.ts",
      "contentFile": "artwork.ts",
      "expectedHash": "从 file 或 context 返回值复制的实际 hash"
    }
  ],
  "bindings": [
    {"field": "实际数据字段", "channel": "源码中实际采用的视觉编码说明"}
  ]
}
```

```sh
npm run --silent visbloom -- files --project PROJECT_ID --input edits/changes.json
```

`contentFile` 相对 manifest 所在目录解析，示例会读取 `edits/artwork.ts`。也可直接提供 `content` 字符串；两者只能选一个。已有文件需要正确的 `expectedHash`；新增文件可以省略。

改动源码时应同时填写准确的 `bindings`，说明实际数据字段如何对应画面；示例中的占位文字必须换成作品真实编码。说明与文件在同一 revision 原子保存，不会自动推导。显式传 `"bindings": []` 可清空说明；非 `controls.json` 源码真正变更而未传 `bindings` 时，系统会清空旧说明，避免继续显示过时文案。相同源码或仅修改控件声明不会自动清空。仅修正文案时，可以提交内容完全相同的源码文件和新的 `bindings`，保留当前参数。

所有接受 JSON 的命令都支持 `--input -` 从 stdin 读取对象，旧位置 JSON 仍可用：

```sh
cat patch.json | npm run --silent visbloom -- patch --project PROJECT_ID --revision REVISION --input -
npm run --silent visbloom -- patch '{"projectId":"PROJECT_ID","expectedRevision":3,"patch":{"paused":true}}'
```

`import --file` 根据 `.csv` / `.json` 扩展名识别格式；可附 `--revision` 防止导入覆盖并发更新。

```sh
npm run --silent visbloom -- import --project PROJECT_ID --file data.csv --revision REVISION
npm run --silent visbloom -- checkpoint --project PROJECT_ID --label '调整之前'
npm run --silent visbloom -- restore --project PROJECT_ID --checkpoint CHECKPOINT_ID --revision REVISION
```

## 查询默认只读

```sh
npm run --silent visbloom -- query --project PROJECT_ID --sql 'SELECT * FROM data' --max-rows 5
npm run --silent visbloom -- query --project PROJECT_ID --sql-file query.sql --out rows.json
```

默认查询不改变作品 revision 或画面数据。只有显式 `--apply --revision` 才把结果应用到作品：

```sh
npm run --silent visbloom -- query --project PROJECT_ID --sql-file query.sql --apply --revision REVISION --max-rows 10000
npm run --silent visbloom -- result --project PROJECT_ID --offset 0 --limit 20
```

只读查询默认最多 20 行，应用查询默认最多 10000 行，`--max-rows` 范围为 1–10000。应用/导入返回 `rowCount` 与 `truncated`；务必检查截断标记，不能把截断结果当作完整数据。

## 导出必须真实完成

```sh
npm run --silent visbloom -- capture --project PROJECT_ID --revision REVISION --out artwork.png --width 1600 --height 1200 --time 0
npm run --silent visbloom -- export --project PROJECT_ID --revision REVISION --out artwork.html
```

PNG 需要工作台连接。若已有连接仍在确认新版本，任务最多等待3秒，严格匹配版本与构建后才截图；真断连仍失败。带 `--out` 时最多等待导出任务 20 秒，完成后下载；失败、断连、取消或过期均报错，不保存假图，不往 stdout 输出 base64。`capture` 必须提供 `--out`。

不带 `--out` 的 `export` 返回真实任务信息，后续可用：

```sh
npm run --silent visbloom -- job --id JOB_ID
npm run --silent visbloom -- download --id JOB_ID --out artwork.html
```

`--out` 默认拒绝覆盖文件，明确覆盖时添加 `--force`。文件先写入同目录临时文件，成功后原子提交；写入失败会清理临时文件。`file` / 只读 `notes` 写原始文本，其余读取命令写 JSON。写入手记不接受 `--out`。

退出码：`0` 成功，`1` 操作失败，`2` 用法或 JSON 错误，`3` 版本/hash 冲突。失败时 stdout 为空，stderr 返回单个 JSON 对象：

```json
{"error":{"code":"revision_conflict","message":"项目已经改变，请重新读取。","status":409}}
```

## 打包 GitHub Pages

`pages --project PROJECT_ID --revision REVISION --out NEW_DIRECTORY` 将 `index.html`、`cover.jpg` 与 `.nojekyll` 写入新目录。加 `--cover chosen.jpg` 保留作者的 JPEG。命令返回文件路径与封面来源，供发布前检查。参见 [部署文档](DEPLOYMENT.md#发布到作者自己的-github-pages)。

## 可恢复删除

删除和恢复都需要明确项目ID及当前版本，不默认选最近项目。删除将项目移入回收站，原数据、源码、状态、缩略图及历史保留；恢复不会新造作品版本。

```sh
npm run --silent visbloom -- delete --project PROJECT_ID --revision REVISION
npm run --silent visbloom -- trash
npm run --silent visbloom -- recover --project PROJECT_ID --revision REVISION
```

## Skill 管理与测试准备

`art skills` 与 `art eval` 可离线运行，不连接工作台。查看[当前 Skill 入口](../skills/entries.json)，或运行 `npm run --silent visbloom -- skills --help` 了解发现、固定版本与打包命令。

`create --preset blank` 创建无案例数据、无参数声明、无视觉映射的 Canvas2D 透明骨架，用于新创作及重建测试。skinbloom / stellar-drift 会载入既有作品，不可冒充重建空白起点。测试运行应使用独立数据目录与服务，不在作者作品上操作。

`npm run --silent visbloom -- skills active`核对项目当前默认Skill入口与冻结版本；`eval prepare --arms candidate`仅准备修订版复测，明确记录single，默认仍current/candidate。两者均离线，无宿主安装副作用。

## 作品分享

```sh
npm run --silent visbloom -- share create --project PROJECT_ID --revision REVISION
npm run --silent visbloom -- share list --project PROJECT_ID
npm run --silent visbloom -- share revoke --project PROJECT_ID --id LINK_ID
```

仅在创作者明确要求分享后创建链接；它会发布当前选定结果数据与作品交互。返回url、embedUrl、scope及固定revision；scope=local表示本机链接。公开发布需要配置独立分享服务，见DEPLOYMENT.md。撤回只影响该链接，不删除创作项目。

远程个人服务支持HTTPS origin；本机支持HTTP。使用服务口令时，在Agent进程环境设置ART_API_TOKEN，CLI/MCP携带Bearer认证；不把口令放入命令参数、作品或公开链接。平台不需要AI模型密钥。
