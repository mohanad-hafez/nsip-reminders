const fs=require('node:fs'),crypto=require('node:crypto');
const {reminder}=require('./reminder-policy.cjs');
const repository=process.env.GITHUB_REPOSITORY,task=process.env.REMINDER_TASK;
if(repository!=='mohanad-hafez/nsip-reminders')throw Error('Unexpected target repository');
const sourcePath=task==='weekly'?'.github/workflows/weekly-reminder.md':task==='seasonal'?'.github/workflows/eov-seasonal-reminder.md':null;
if(!sourcePath)throw Error('Unknown task');
const source=fs.readFileSync(sourcePath,'utf8');
const report={phase:'live_fork_deterministic_replacement',task,github_run_id:process.env.GITHUB_RUN_ID,github_sha:process.env.GITHUB_SHA,now:new Date().toISOString(),source_path:sourcePath,source_sha256:crypto.createHash('sha256').update(source).digest('hex'),requests:[],model_calls:0};
const save=()=>fs.writeFileSync('reminder-result.json',JSON.stringify(report,null,2)+'\n');
async function api(endpoint,method='GET',body){
 const item={endpoint,method,status:'request_started'};report.requests.push(item);save();
 let response;try{response=await fetch(`https://api.github.com/repos/${repository}/${endpoint}`,{method,headers:{Authorization:'Bearer '+process.env.GITHUB_TOKEN,Accept:'application/vnd.github+json','Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000)});}catch(e){item.status=method==='GET'?'read_failed':'delivery_uncertain';save();throw Error(item.status+' '+endpoint);}
 const raw=await response.text();item.status='received';item.http_status=response.status;item.response_sha256=crypto.createHash('sha256').update(raw).digest('hex');save();
 if(!response.ok){if(method!=='GET'&&response.status>=500)item.status='delivery_uncertain';save();throw Error('GitHub HTTP'+response.status+' '+method+' '+endpoint);}
 return raw?JSON.parse(raw):null;
}
async function pages(endpoint){const all=[];for(let page=1;;page++){const rows=await api(endpoint+(endpoint.includes('?')?'&':'?')+`per_page=100&page=${page}`);all.push(...rows);if(rows.length<100)return all;}}
async function main(){
 const issues=await pages('issues?state=open');
 report.observed_open_issues=issues.map(i=>({number:i.number,title:i.title,state:i.state,labels:i.labels.map(l=>l.name),pull_request:i.pull_request}));
 report.plan=reminder(task,source,report.now,report.observed_open_issues);save();
 if(report.plan.decision==='noop'){
  const observed=await api('issues/'+report.plan.existing_issue);if(observed.state!=='open'||!observed.title.startsWith(report.plan.title))throw Error('Dedup readback mismatch');
  report.status='verified_noop';report.existing_issue={number:observed.number,url:observed.html_url};save();
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,`Existing reminder: ${observed.html_url}\nNo duplicate created.\n`);return;
 }
 const labels=await pages('labels');
 for(const name of report.plan.labels)if(!labels.some(l=>l.name===name))await api('labels','POST',{name,color:'ededed'});
 const issue=await api('issues','POST',{title:report.plan.title,body:report.plan.body,labels:report.plan.labels});report.created_issue={number:issue.number,url:issue.html_url};save();
 const observed=await api('issues/'+issue.number);
 if(observed.title!==report.plan.title||observed.body!==report.plan.body||report.plan.labels.some(name=>!observed.labels.some(l=>l.name===name)))throw Error('Created reminder readback mismatch');
 report.closed_older=[];
 for(const number of report.plan.close_older){await api('issues/'+number,'PATCH',{state:'closed',state_reason:'completed'});report.closed_older.push(number);save();}
 report.status='verified_created';report.readback_verified=true;save();
 fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,`Reminder: ${issue.html_url}\n`);console.log(issue.html_url);
}
main().catch(e=>{report.status='stopped_inspection_required';report.error=e.message;save();console.error(e.message);process.exitCode=1});
