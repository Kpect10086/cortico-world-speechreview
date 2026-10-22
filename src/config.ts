import type { ConfigGroup } from 'cortico/core/types.ts';
import type { CloudOptions } from './cloud.ts';
export interface SpeechreviewConfigSection extends CloudOptions {
  enabled: boolean; reviewEnabled: boolean; port: number; maxConcurrent: number; directionFile: string; hostingStateFile: string; blockedTexts: string;
}
export const SPEECHREVIEW_DEFAULTS: SpeechreviewConfigSection = {
  enabled: false, reviewEnabled: true, port: 7795, endpoint: 'https://api.deepseek.com/v1', model: '',
  apiKeySecret: 'SPEECHREVIEW_API_KEY', timeoutMs: 8000, targetMs: 200, maxConcurrent: 2,
  directionFile: '', hostingStateFile: '', blockedTexts: '',
};
export const SPEECHREVIEW_CONFIG_GROUP: ConfigGroup = {
  id: 'world:speechreview', owner: 'world:speechreview', schema: {type: 'object', title: '通用审核', properties: {
    'worlds.speechreview.reviewEnabled': {type: 'boolean', title: '开启内容审核', 'x-hot': true,
      description: '关闭后内容直通，不调用审核模型；持续安静要求仍有效。保留 World 启用以维持审核接口。'},
    'worlds.speechreview.directionFile': {type: 'string', title: '导演状态文件', 'x-hot': true},
    'worlds.speechreview.hostingStateFile': {type: 'string', title: '持久主持指令文件', 'x-hot': true},
    'worlds.speechreview.maxConcurrent': {type: 'integer', minimum: 1, maximum: 4, title: '并发审核上限', 'x-hot': true},
    'worlds.speechreview.endpoint': {type: 'string', title: '审核端点', 'x-hot': true},
    'worlds.speechreview.model': {type: 'string', title: '审核模型', 'x-hot': true},
    'worlds.speechreview.apiKeySecret': {type: 'string', title: '密钥环境变量名称', 'x-hot': true},
    'worlds.speechreview.timeoutMs': {type: 'integer', minimum: 200, maximum: 30000, title: '审核超时（毫秒）', 'x-hot': true},
    'worlds.speechreview.targetMs': {type: 'integer', minimum: 1, title: '决策目标（毫秒）', 'x-hot': true},
    'worlds.speechreview.blockedTexts': {type: 'string', title: '审核词表（| 分隔）', 'x-hot': true,
      description: '英文按完整单词或短语直接拦截，不区分大小写；中文根据整句语义审核。'},
    'worlds.speechreview.port': {type: 'integer', minimum: 1024, maximum: 65535, title: '本机审核端口'},
  }},
};
