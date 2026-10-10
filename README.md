# MF8455 官网展示票价监控

福州长乐 FOC → 成都天府 TFU，2026-10-10 至 2026-10-21，重点 10 月 20 日。时间统一为 Asia/Shanghai。

用户已调整验收口径：只需官网公开展示最低价和 Z 舱价，**不验证两人同时购买的最终价格**。两人数字仅为票价乘 2 的估算；官网此页面税费口径未明确时记录 unknown。不登录、不下单、不自动购票。

## 已实现

- Playwright 正常打开厦航真实公开订票页，展开 MF8455 的舱位列表及“更多舱位”。
- 每次查询独立 JSON 快照，含成功、失败、未显示航班、已过起飞时间；历史绝不覆盖。
- 同来源、同税费口径的成功报价间检测最低价和 Z 舱变化；失败和缺失 Z 舱不会变成零元、涨跌或售罄。
- 手机优先静态 TypeScript + Chart.js 页面，支持逐日表、日期切换、历史快照、失败记录、来源与查询时间。
- 可替换数据源接口及 Work 手动导入，手动结果在页面单独筛选，不混充自动实时数据。
- GitHub Actions 每小时 :07 查询全日期，:22/:37/:52 单独查 20 日。它们合起来是每 15 分钟一次；GitHub 调度可能延迟。
- 20 日按最近官网成功记录的起飞时间停止查询；首次默认依据官网实测为 16:35。其他日期也依据成功记录的起飞时间跳过。
- 21 日后不再查询。网页历史保留。
- 微信推送未实现、未启用；没有 PushPlus Token。

## 本地使用

```powershell
npm ci
$env:BROWSER_CHANNEL='msedge'
npm run probe
npm run monitor
npm run monitor -- --focus
npm test
npm run build
npm run dev
```

未安装 Edge 的环境：执行 `npx playwright install chromium`，并清除 BROWSER_CHANNEL。没有使用反检测参数、验证码破解或私有接口重放。

原始快照在 `data/snapshots/`；网页只读 `public/data/index.json`。本地证据在忽略的 `evidence/`，HAR、凭据相关诊断只放忽略的 `private/`，不进仓库。截图失败会留下警告，不会使已成功解析的报价失效。

## GitHub Pages 与定时任务

仓库： https://github.com/Flora614/fly
网页： https://flora614.github.io/fly/

仓库 Settings → Pages 选择 GitHub Actions。工作流自带依赖安装、测试、采集、提交数据和部署；串行运行防止多轮相互覆盖。默认分支为 main。

仓库变量 `MONITOR_ENABLED=true` 才允许定时任务采集；手动 workflow_dispatch 不受此开关限制，用于正式启用前的云端测试。工作流 push 只构建部署，不额外查价。

正式启用前检查 Actions 手动全日期采集的结果。GitHub 数据中心可能与本机访问结果不同；本机成功不代表云端成功。云端挑战、超时和登录限制会保存为失败。未显示航班不推断为售罄。

采集和部署权限为 contents:write（追加快照）、pages:write、id-token:write（Pages部署）；日期检查任务另有 actions:write，仅用于全部日期结束后自动禁用本工作流，避免继续消耗调度资源。网页历史继续保留。无需个人令牌或 PushPlus Secret 来运行采集。仓库自动 GITHUB_TOKEN 不出现在前端或数据中。

## 替换数据源

将可信适配器的绝对 file: URL 设为 PRICE_PROVIDER_MODULE。模块默认导出一个类，提供 `async init()`、`async query(date)` 和 `async close()`。query 返回满足 `lib/store.mjs` 的 observation 结构。不要从导入 JSON 加载可执行代码，不要使用搜索缓存代替实时票价。

## Work 手动导入

```powershell
npm run import -- path/to/work-results.json
```

输入为 records 数组或包含 records 的对象，保留实际观察时间。字段示意（数值和时间必须替换为真实观察，不可直接拿示意当报价）：

```json
{
 "records": [{
  "date": "2026-10-20", "flight": "MF8455", "origin": "FOC", "destination": "TFU",
  "queriedAt": "<实际查询ISO时间，须含时区>",
  "status": "success", "lowest": "<真实数字>", "zPrice": "<真实数字或null>",
  "departureAt": "2026-10-20T16:35:00+08:00", "inventory": "<页面库存原文>",
  "source": {"kind":"manual","name":"Work 手动查询厦航官网","url":"https://www.xiamenair.com/zh-cn/","note":"<查询条件和结果说明>","evidence":"<截图或原始结果引用>"},
  "priceScope":"official_display_per_adult","currency":"CNY","taxBasis":"unknown",
  "partyPriceVerified":false
 }]
}
```

实际数值必须是 JSON number。失败结果 lowest 和 zPrice 都为 null。过期日期结果允许导入历史，但不会标为实时。手动内容不会直接从网页上传到服务器；本地 CLI 导入后提交快照再部署。

## 验证边界

单元测试使用隔离临时目录；浏览器故障注入只发生在 QA 页面，不会污染真实历史。页面支持现代手机浏览器，微信真机兼容性需要实际打开验证。真实票价变化无法按需制造，变化计算通过隔离测试验证，真实变化是否观察到以历史快照为准。
