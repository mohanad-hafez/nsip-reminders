const fs = require('node:fs');
const assert = require('node:assert/strict');
const {reminder} = require('./reminder_policy.cjs');
const task = process.env.TASK;
const fixture = JSON.parse(fs.readFileSync(task+'.json','utf8'));
const source = fs.readFileSync(task+'-source.md','utf8');
const expected = reminder(task,source,fixture.inputs.now,fixture.inputs.open_issues);
assert.equal(expected.decision,'create');
assert.deepEqual(expected.close_older,[]);
const normalize = body => body.replace(/\r\n/g,'\n').split('\n').map(line=>line.trimEnd()).join('\n').trim();
let result;
if (process.env.ARM==='script') {
  result = expected;
} else {
  const calls = fs.readFileSync('evidence/tools.jsonl','utf8').trim().split('\n').map(JSON.parse);
  assert(calls.every(call=>!call.error));
  assert.deepEqual(calls.slice(0,-1).map(call=>call.args.name).sort(),['now','open_issues']);
  assert.equal(calls.at(-1).name,'publish_result');
  result = JSON.parse(calls.at(-1).args.body);
}
assert.equal(result.title,expected.title);
assert.deepEqual([...result.labels].sort(),[...expected.labels].sort());
assert.equal(normalize(result.body),normalize(expected.body));
fs.writeFileSync('evidence/result.json',JSON.stringify({
  title:result.title,body:normalize(result.body),labels:[...result.labels].sort(),
}));
