# PushPlus 微信通知

现有查价、不可变价格快照、网页及调度日期不变。通知在价格快照提交后独立执行，`continue-on-error` 保证推送错误不阻断后续 Pages 构建部署。新增代码不登录、不预订、不购票。

## 安全配置与测试

1. 仓库 [Actions Secrets](https://github.com/Flora614/fly/settings/secrets/actions) 新增 `PUSHPLUS_TOKEN`。使用本人 PushPlus Token 或消息 Token；只放这里，不提交到代码、聊天、日志、网页、导入文件或仓库变量。
2. 打开 [PushPlus manual WeChat test](https://github.com/Flora614/fly/actions/workflows/pushplus-test.yml)，Run workflow，勾选 `authorize_send` 才会发送一条真实微信测试。默认不勾选，不会发送。每个新 run 代表新的单次授权；重跑同一 run 复用去重标识。
3. 测试读取已有自动查询历史，并明确标为历史报价，不额外查价。它不改变自动发送开关。测试不需要 npm 安装或浏览器。
4. PushPlus API `200` 仅表示受理，不是微信送达证明。查看 Actions Summary 和 `data/notifications/state.json` 的 `accepted`，并由本人确认微信已收到测试通知。
5. 确认接收后，才在 [Actions Variables](https://github.com/Flora614/fly/settings/variables/actions) 设置 `PUSHPLUS_TEST_CONFIRMED=true` 和 `PUSHPLUS_ENABLED=true`。脚本还检查仓库中已保存成功受理的测试记录，三项同时满足才允许定时发送。任何一项缺失都不发送。

本次接入真实测试授权已获得；Token 由本人安全添加。不得由代理在没有授权时 dispatch 测试。重复点 Run workflow 会创建新测试并再发送一条，请勿连续点击。

关闭微信提醒只需把 `PUSHPLUS_ENABLED=false`，不影响查价和网页。通知仅由原工作流的 `schedule` 事件触发；普通代码 push、手动查价、本地查价和 Work 手动导入都不会发微信。

## 消息规则

- 原全日期小时轮次发送 20 日简报；原 focus 轮次只有最低价或 Z 舱出现可比较的数值变化才发送。
- 同一轮最低价、Z 舱变化及低价提示合为一条；小时简报包含本轮变化，不另发第二条。每个上海时区小时简报最多一条，变化消息按查询 roundId 去重。
- 显示最低价、Z 舱、库存原文、有效报价时间、来源、旧价→新价、每人差额和两人估算差额、专属网页链接。最低价严格小于 550 才突出显示；550 本身不触发。
- 只比较同来源、同税费口径的成功自动记录。失败、未找到航班、Z 舱未显示都不当作涨跌或售罄；手动导入不参与自动推送比较。
- 本轮查询失败的小时简报显示“最新有效历史报价，不是本轮实时价格”及其原始时间；从未成功时明确无有效报价。
- 所有时间 Asia/Shanghai。两人金额仍只是显示票价乘2估算；不改变已验收价格口径。
- 复用原 `shouldQuery` 起飞停止规则，含官网成功记录的改时；到停止时间不再发送简报、变化消息或待重试消息。原监控日期范围及整个工作流停止条件未更改。

## 发送状态、重试与边界

通知状态仅存 `data/notifications/state.json`，不复制到 `public/` 或 `dist/`。内容只有公开票价和通知元数据，不含 Token、接收者资料、API 原始响应或原始异常。错误只保留安全代码如 `api_429`、`http_403`。

每次发送前先把 `sending` 状态提交并推送到仓库；远端保存失败则不发送。主工作流与测试工作流共用串行锁，防止相互覆盖状态。收到有效受理响应后记录 `accepted`，不把它命名为 delivered/success。

- 明确拒绝或缺少 Secret：保存 `retry_wait`、尝试次数、错误代码和 `retryAt`；后续定时轮次到期重试，最多3次，间隔15分钟、30分钟。GitHub调度延迟会使重试晚于这个时间。
- 有新简报/新价格提醒时，旧的待重试自动通知标为 `superseded`，发送一条合并后的最新通知，不在同轮补发一串旧消息。
- 网络超时、5xx、无效响应、发送中进程中断：标为 `uncertain`，不盲目重发，避免接口其实已受理后造成重复。检查 PushPlus 消息记录再处理；不会影响后续新的小时简报。
- `accepted` 只证明接口受理。仅有消息 Token 无法调用需要 AccessKey/用户密钥的官方最终投递查询接口；此版本不接入回调服务器，也不宣称能自动确认微信异步投递。请在 PushPlus 消息记录中检查异步投递失败。后续若需要自动追踪最终投递，可单独接入官方开放接口或回调。

参考：[发送接口与异步语义](https://www.pushplus.plus/doc/guide/api.html)、[最终投递查询的鉴权要求](https://pushplus.plus/doc/guide/openApi.html)。

## 验证

`npm test` 包含隔离临时目录中的合并、低价阈值、不变价、失败历史、人工来源、税费口径、起飞/改时、去重、发送前持久化、重试上限、超时歧义、Secret 不落盘和 CLI 授权检查。全部使用模拟发送，绝不向真实微信发送测试夹具。真实票价变化无法人为制造，线上实际变化提醒需等待真实变化。
