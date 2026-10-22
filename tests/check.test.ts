import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateReview, hostingInstructions, SpeechreviewWorld, englishBan} from '../src/world.ts';
import {SPEECHREVIEW_DEFAULTS} from '../src/config.ts';
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {WorldHost} from 'cortico/core/types.ts';
test('只有布尔审核结果可用，缺失或字符串放行无效', () => {
  assert.equal(validateReview({allow:true,reason:'正常吐槽'}).allow,true);
  assert.equal(validateReview({allow:false}).allow,false);
  for (const invalid of [null,{}, {allow:'true'}, {allow:1}]) assert.throws(()=>validateReview(invalid));
});

test('真实本机审核接口：固定反馈放行，词表拒绝，持久禁言优先且损坏状态关闭', async () => {
  const dir = mkdtempSync(join(tmpdir(),'speechreview-'));
  const file = join(dir,'hosting-state.json');
  const port = 18000 + Math.floor(Math.random()*15000);
  writeFileSync(file,JSON.stringify({instructions:[]}));
  const cfg = {...SPEECHREVIEW_DEFAULTS,port,hostingStateFile:file,blockedTexts:'forbidden'};
  const world = new SpeechreviewWorld({cfg,secret:()=>{throw new Error('LLM must not be called');}});
  const check = async (text: string) => (await fetch(`http://127.0.0.1:${port}/review`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text})})).json() as Promise<{allow:boolean;reason:string}>;
  await world.start({log:{warn:()=>{}}} as unknown as WorldHost);
  try {
    assert.deepEqual(hostingInstructions(file),[]);
    assert.equal((await check('filtered')).allow,true);
    assert.equal((await check('FORBIDDEN!')).reason,'blocked-term');
    cfg.reviewEnabled = false;
    assert.equal((await check('FORBIDDEN!')).reason,'disabled');
    writeFileSync(file,JSON.stringify({instructions:[{kind:'quiet',text:'安静',sourceText:'先别说话'}]}));
    assert.equal((await check('filtered')).reason,'quiet');
    assert.equal((await check('任何台词')).allow,false);
    cfg.reviewEnabled = true;
    writeFileSync(file,'corrupted');
    assert.equal((await check('filtered')).reason,'unavailable');
  } finally {await world.stop();rmSync(dir,{recursive:true,force:true});}
});

test('英文按完整词匹配，中文词表不在本地直接拦截', () => {
  const terms = ['ass', 'forbidden', '禁止'];
  assert.equal(englishBan('ASS!', terms), 'ass');
  assert.equal(englishBan('这是forbidden。', terms), 'forbidden');
  assert.equal(englishBan('ｆｏｒｂｉｄｄｅｎ', terms), 'forbidden');
  for (const text of ['class', 'classic', 'forbiddenness', '禁止浪费']) assert.equal(englishBan(text, terms), undefined);
});
