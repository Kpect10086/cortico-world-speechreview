# 通用审核 — src/world.ts / SpeechreviewWorld

独立的 Cortico World 扩展，支持 Cortico 0.2.4 / World API 6、Node.js 22.16+。使用原生 fetch 与 HTTP，无额外运行依赖。

## 安装

在 Cortico 扩展页安装 **cortico-world-speechreview@0.1.0**，重启并启用“通用审核”。配置审核端点、实际可用的模型 ID、密钥环境变量名称，在部署的密钥管理中提供对应密钥。默认端点 https://api.deepseek.com/v1，模型留空，变量名 SPEECHREVIEW_API_KEY；可更换兼容 Chat Completions 的供应商，需支持 JSON 输出。审核会消耗该供应商的模型用量，需要用户自行开通账号与配置凭据。

默认监听 http://127.0.0.1:7795/review，不暴露到局域网。在 QQ ProMAX 的内容审核地址或分区权重记忆的 weightedMemory.contentReviewUrl 中填写该地址。仅安装不会自动接管其他扩展；其他输出端必须支持此审核协议并配置地址。独立端口被占用时更换端口并同步调用端。

请求：POST /review，Content-Type: application/json，正文为 {"text":"待审核内容","purpose":"broadcast"}。purpose 支持 broadcast、message、incoming、received、memory。返回 allow、reason、elapsedMs；记忆和接收文本的替换仅在二次审核通过后返回 sanitizedText。审核服务不可用或未配置模型密钥时不会放行原文。

reviewEnabled 默认 true；关闭后内容直通且不调用模型，广播持续安静要求仍有效。directorStatusFile、hostingStateFile 为可选文件，默认留空，无需直播导演插件。仅通过回环连接调用，不接受浏览器 Origin。服务接收的正文会发送至你所配置的审核供应商。

## 行为与开发

SpeechreviewWorld (`src/world.ts`) owns the independent speech/subtitle release decision.

Enable this World independently of the live director. The hot `reviewEnabled` switch defaults to true; false returns `allow=true, reason=disabled` without model calls for every purpose. Broadcast quiet instructions and request validation still apply. Keep the World mounted to retain the loopback service. The loopback service accepts POST `/review` with `{text, purpose}` and returns `{allow, reason, elapsedMs}`. Purpose is `broadcast` (default), `message`, `incoming`, `received` (current QQ input), or `memory`. Browser-origin requests, malformed results, overload, timeout and provider failure do not allow content while review is enabled. Cloud usage and complete decision latency are recorded through WorldHost.

The model request queue is bounded to 64 waiting requests. Memory archival uses at most `maxConcurrent - 1` slots when concurrency is greater than one, leaving capacity for current input and output. Waiting requests abort when their client disconnects. In `blockedTexts` (pipe-separated), English words or phrases match case-insensitively at word boundaries after NFKC normalization. Chinese entries go to the model as semantic terms and never cause a local literal rejection. Presentation tags and safe anger are evaluated by sentence meaning. Memory and received English matches require a sanitized replacement and a second approval.

All purposes use one semantic policy covering sensitive subjects, abuse and disguised variants. Incoming live comments additionally reject disguised instructions, regardless of sender identity. Hosting quiet instructions apply to broadcast only. Rejected memory content includes `sanitizedText` only after a second decision approves the replacement; names, attribution and safe facts are preserved. QQ uses text `filtered` on rejection, live comments are discarded, and failed memory review does not authorize the original text.


npm install、npm test、npm run typecheck。测试使用本机模拟供应商，不需要真实密钥或对外发消息。200ms 为目标，不是延迟保证。
