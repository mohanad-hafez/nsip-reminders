function isoWeek(date) {
  const d=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()));
  d.setUTCDate(d.getUTCDate()+4-(d.getUTCDay()||7));
  return Math.ceil((((d-new Date(Date.UTC(d.getUTCFullYear(),0,1)))/86400000)+1)/7);
}
function reminder(task,source,now,openIssues){
  const date=new Date(now);if(!Number.isFinite(date.getTime()))throw Error('Invalid date');
  const bodyMatch=/```markdown\r?\n([\s\S]*?)\r?\n```/.exec(source);if(!bodyMatch)throw Error('Source template missing');
  let title,body=bodyMatch[1],labels;
  if(task==='weekly'){
    title='Weekly Farm Check - Week '+isoWeek(date);labels=['routine','maintenance'];
  }else if(task==='seasonal'){
    const month=date.getUTCMonth()+1;
    const season=month>=3&&month<=5?'Spring':month>=6&&month<=8?'Summer':month>=9&&month<=11?'Fall':'Winter';
    const section=source.split('## Season-Specific Tips')[1];if(!section)throw Error('Source tips missing');
    const match=new RegExp('### '+season+'\\r?\\n([\\s\\S]*?)(?=\\r?\\n### |$)').exec(section);if(!match)throw Error('Season tips missing');
    const tips=match[1].trim();if(tips.split(/\r?\n/).filter(l=>l.startsWith('- ')).length!==5)throw Error('Unexpected source tip count');
    title=`EOV ${season} ${date.getUTCFullYear()} Monitoring`;labels=['eov','seasonal','verification'];
    body=body.replaceAll('{Season}',season).replaceAll('{Year}',String(date.getUTCFullYear())).replace('<!-- INSERT the bullet points from the matching season below -->',tips);
  }else throw Error('Unknown reminder task');
  // Preserve the authored prefix-based deduplication policy.
  const existing=openIssues.find(i=>i.state==='open'&&!i.pull_request&&i.title.startsWith(title));
  if(existing)return{decision:'noop',title,existing_issue:existing.number};
  return{decision:'create',title,body,labels,close_older:task==='seasonal'?openIssues.filter(i=>i.state==='open'&&!i.pull_request&&/^EOV (Spring|Summer|Fall|Winter) \d{4} Monitoring/.test(i.title)&&labels.every(label=>i.labels.some(l=>(typeof l==='string'?l:l.name)===label))).map(i=>i.number):[]};
}
module.exports={isoWeek,reminder};
