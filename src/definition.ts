import type {WorldDefinition} from 'cortico/world.ts';
import {SPEECHREVIEW_DEFAULTS, type SpeechreviewConfigSection} from './config.ts';
import {SpeechreviewWorld} from './world.ts';
export const SPEECHREVIEW: WorldDefinition<SpeechreviewConfigSection> = {
  id: 'speechreview', label: '通用审核', defaults: () => ({...SPEECHREVIEW_DEFAULTS}),
  describe: {tools: [], events: []},
  create: ctx => new SpeechreviewWorld({cfg: ctx.cfg, secret: name => ctx.secret(name)}),
};
export default SPEECHREVIEW;
