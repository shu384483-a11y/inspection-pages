'use strict';
const $=selector=>document.querySelector(selector), C=window.APP_CONFIG, W=window.Inspection, Access=window.InspectionAccess;
const S={uid:null,profile:null,branches:{},periods:{},records:{},period:'',branch:'',tab:'check',busy:false,generation:0};
let accessSession=null;
const esc=value=>String(value??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const stamp=()=>({'.sv':'timestamp'}), editor=()=>['admin','inspector'].includes(S.profile?.role), locked=()=>S.periods[S.period]?.locked!==false;
const msg=text=>{$('#message').textContent=text;};
async function db(path,method='GET',body){
  const target=Access.route(path,method,body,accessSession);
  if(target.local)return target.local;
  return Access.request(C.databaseURL,target.path,target.method,target.body);
}
async function run(operation){
  if(S.busy)return;
  S.busy=true;
  document.querySelectorAll('button,#period,#branch,#accessKind').forEach(button=>{if(!button.disabled){button.dataset.busyDisabled='1';button.disabled=true;}});
  try{await operation();}catch(error){msg(error.message);}finally{
    S.busy=false;
    document.querySelectorAll('[data-busy-disabled]').forEach(button=>{button.disabled=false;delete button.dataset.busyDisabled;});
  }
}
function logout(){
  S.generation++;
  accessSession=null;
  Object.assign(S,{uid:null,profile:null,records:{},receipts:{},branches:{},periods:{}});
  $('#content').replaceChildren();
  $('#workspace').hidden=true;
  $('#login').hidden=false;
  $('#login').reset();
  updateEntry();
  msg('已退出，页面中的资料和进入码已清除。');
}
function updateEntry(){
  const branch=$('#accessKind').value==='branch';
  $('#nameLabel').hidden=branch;
  $('#operatorName').required=!branch;
  $('#entryHelp').textContent=branch?'请使用本网点专属链接或整改码；链接仅交给本网点经办人员。':'填写姓名和检查组进入码。姓名用于记录经办人，无需注册个人账号。';
}
$('#accessKind').onchange=updateEntry;
const entryFragment=new URLSearchParams(location.hash.slice(1));
if(entryFragment.has('branch')){
  $('#accessKind').value='branch';
  $('#accessCode').value=entryFragment.get('branch');
}else if(entryFragment.has('staff')){
  $('#accessCode').value=entryFragment.get('staff');
}
if(location.hash)history.replaceState(null,'',location.pathname+location.search);
updateEntry();
$('#login').addEventListener('submit',event=>{
  event.preventDefault();
  run(async()=>{
    const kind=$('#accessKind').value;
    msg('正在连接云端并核对入口权限…');
    const candidate=await Access.enter(C.databaseURL,kind,$('#accessCode').value.trim(),$('#operatorName').value);
    accessSession=candidate;
    S.uid=candidate.actor;
    S.profile=kind==='staff'?{role:'admin',active:true}:{role:'branch',active:true,branch:candidate.branch};
    try{
      S.branches=candidate.branches;
      S.periods=await db('v2/periods')||{};
      const codes=Object.keys(S.branches).sort();
      if(!codes.length||!Object.keys(S.periods).length)throw Error('检查网点或季度尚未配置。');
      const query=new URLSearchParams(location.search),wanted=query.get('branch');
      if(wanted&&!codes.includes(wanted))throw Error('此入口与所选网点不一致，请重新扫描本网点二维码。');
      S.branch=wanted||candidate.branch||codes[0];
      S.period=Object.hasOwn(S.periods,query.get('period'))?query.get('period'):(Object.hasOwn(S.periods,C.defaultPeriod)?C.defaultPeriod:Object.keys(S.periods).sort().at(-1));
      S.tab=kind==='branch'?'rectify':'check';
      $('#period').innerHTML=Object.keys(S.periods).sort().reverse().map(period=>`<option value="${esc(period)}">${esc(period)}${S.periods[period].locked?'（已锁定）':''}</option>`).join('');
      $('#period').value=S.period;
      $('#branch').innerHTML=codes.map(code=>`<option value="${code}">${W.displayCode(code)} ${esc(S.branches[code].name)}</option>`).join('');
      $('#branch').value=S.branch;
      $('#identity').textContent=kind==='staff'?'检查人员 · '+candidate.actor.slice(10):'网点整改 · '+S.branches[S.branch].name;
      $('#workspace').hidden=false;
      $('#login').hidden=true;
      $('#accessCode').value='';
      await load();
    }catch(error){logout();throw error;}
  });
});
if(entryFragment.has('branch'))$('#login').requestSubmit();

$('#logout').onclick=logout;$('#refresh').onclick=()=>run(load);
$('#period').onchange=()=>run(async()=>{S.period=$('#period').value;await load();});$('#branch').onchange=()=>run(async()=>{S.branch=$('#branch').value;await load();});
$('#nav').onclick=e=>{const b=e.target.closest('[data-tab]');if(b&&!S.busy){S.tab=b.dataset.tab;render();}};
async function load(){const g=++S.generation,q=S.period,b=S.branch;const [records,period,receipts]=await Promise.all([db(`v2/issues/${q}/${b}`),db(`v2/periods/${q}`),db(`v2/receipts/${q}/${b}`)]);if(g!==S.generation)return;S.records=records||{};S.receipts=receipts||{};S.periods[q]=period||{locked:true};render();msg(`${q} · ${W.displayCode(b)} ${S.branches[b].name} · 已从云端读取${locked()?'，本季已锁定':''}。`);}
function photosHTML(photos){return `<div class="photo-row">${Object.values(photos||{}).filter(v=>typeof v==='string'&&v.startsWith('data:image/jpeg;base64,')).map(v=>`<img data-enlarge="1" src="${esc(v)}" alt="检查或整改照片">`).join('')}</div>`;}
function photoInput(){return '<label>照片（最多3张，自动压缩）<input name="photos" type="file" accept="image/jpeg,image/png" multiple></label><label><input type="checkbox" name="redacted"> 确认上传照片</label>';}
async function photos(form){const input=form.elements.photos,files=Array.from(input?.files||[]);if(files.length>3)throw Error('每次最多3张照片');if(files.length&&!form.elements.redacted.checked)throw Error('请先勾选照片上传确认');const result=[];for(const file of files){if(!['image/jpeg','image/png'].includes(file.type)||file.size>20*1024*1024)throw Error('请选20MB以内JPEG或PNG图片');const url=URL.createObjectURL(file);try{const im=await new Promise((ok,no)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=no;i.src=url;});let canvas=document.createElement('canvas'),ratio=Math.min(1,1000/Math.max(im.width,im.height));canvas.width=Math.max(1,Math.round(im.width*ratio));canvas.height=Math.max(1,Math.round(im.height*ratio));const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(im,0,0,canvas.width,canvas.height);let out;for(const quality of [.7,.55,.4,.25]){out=canvas.toDataURL('image/jpeg',quality);if(out.length<=220000)break;}if(out.length>220000)throw Error('照片仍过大，请裁剪后重试');result.push(out);}finally{URL.revokeObjectURL(url);}}return result;}
function cards(){const entries=Object.entries(S.records).filter(([,r])=>r.info);return entries.map(([id,r])=>{const s=W.state(r),ev=W.events(r);let actions='';if(!locked()){if(W.can('inspect',r,S.profile.role))actions+=`<button data-action="inspect" data-id="${esc(id)}">记录复查</button>`;if(W.can('submit',r,S.profile.role))actions+=`<button data-action="submit" data-id="${esc(id)}">提交整改</button>`;if(W.can('approve',r,S.profile.role))actions+=`<button data-action="review" data-id="${esc(id)}">复核</button>`;}return `<article class="problem-item ${s.status==='复核通过'||s.status==='现场已到位'?'ok':'unk'}"><div class="cat-badge">${esc(r.info.category)} · ${esc(s.status)}</div><div class="text">${esc(r.info.description)}</div><p class="muted">${r.info.sourcePeriod?'来源：'+esc(r.info.sourcePeriod)+'，本季独立认定':'本季记录'} · 本季扣分：${s.score}</p>${photosHTML(r.info.photos)}<details><summary>查看${ev.length}条处理记录</summary>${ev.map(e=>`<div class="history"><b>${esc(({inspect:'现场复查',submit:'提交整改',approve:'复核通过',return:'退回补充'})[e.type])}</b> ${esc(e.result||'')} · ${esc(e.by||'')}<p class="muted">${new Date(e.at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}</p><div class="text">${esc(e.note)}</div>${photosHTML(e.photos)}</div>`).join('')}</details><div class="tools no-print">${actions}</div></article>`;}).join('')||'<div class="empty-block">本季暂无问题。检查人员可新增问题或生成回头看。</div>';}
function render(){document.querySelectorAll('#nav button').forEach(b=>{b.classList.toggle('active',b.dataset.tab===S.tab);b.hidden=S.profile.role==='branch'&&['new','qr'].includes(b.dataset.tab);});const values=Object.values(S.records).filter(r=>r.info),passed=values.filter(r=>['复核通过','现场已到位'].includes(W.state(r).status)).length;$('#infoRow').innerHTML=`<div class="info-box"><div class="num">${values.length}</div><div class="label">本季问题</div></div><div class="info-box"><div class="num">${passed}</div><div class="label">复核通过 / 现场到位</div></div>`;
if(S.tab==='new'){newForm();return;}if(S.tab==='qr'){renderQR();return;}if(S.tab==='summary'){renderSummary();return;}
$('#content').innerHTML=(S.tab==='check'&&editor()?`<div class="new-form no-print"><button class="btn btn-outline" data-action="carry" ${locked()?'disabled':''}>从历史季度选择回头看问题</button><p class="muted">先筛选、勾选再生成；不自动判定整改，不重复扣上季度分数。</p></div>`:'')+(S.profile.role==='branch'&&!locked()?'<div class="new-form"><button class="btn btn-outline" data-action="receipt">确认已查收本季问题</button><p class="muted">查收仅表示已看到问题，不代表整改完成。</p></div>':'')+cards();}
function newForm(){if(!editor()||locked()){$('#content').innerHTML='<div class="notice">本账号或本季度不允许新增。</div>';return;}$('#content').innerHTML=`<form id="newForm" class="new-form"><h3>新增现场问题</h3><label>类别<select name="category">${['环境卫生类','物品摆放类','标识类','公示公告问题','员工形象','服务过程','其他类'].map(c=>`<option>${c}</option>`).join('')}</select></label><label>问题描述<textarea name="description" maxlength="3000" required></textarea></label>${scoreInput()}${photoInput()}<button class="btn btn-primary">保存问题</button></form>`;$('#newForm').onsubmit=e=>{e.preventDefault();run(async()=>{const f=e.target,d=new FormData(f),score=scoreValue(d),ps=await photos(f),id=crypto.randomUUID();await db(`v2/issues/${S.period}/${S.branch}/${id}/info`,'PUT',{description:clean(d.get('description')),category:d.get('category'),...score,sourcePeriod:'',createdBy:S.uid,createdAt:stamp(),...(ps.length?{photos:ps}:{})});S.tab='check';await load();msg('新问题已保存。');});};}
function clean(v){v=String(v||'').trim();if(!v||v.length>3000||v.includes('农商银行'))throw Error('请填写有效文字，并去除单位全称。');return v;}
function scoreInput(){return '<label>处理方式<select name="kind"><option>提醒</option><option>扣分</option></select></label><label>本季扣分（扣分填负数）<input name="score" type="number" min="-100" max="0" step="0.5" value="0"></label>';}
function scoreValue(d){const kind=d.get('kind'),score=kind==='扣分'?Number(d.get('score')):0;if(!Number.isFinite(score)||score>0||score< -100)throw Error('扣分应在-100至0之间');return {kind,score};}
function eventForm(id,type){const r=S.records[id],s=W.state(r);$('#content').innerHTML=`<form class="new-form" id="eventForm"><h3>${esc({inspect:'记录现场复查',submit:'提交整改，等待复核',review:'复核整改'}[type])}</h3><p class="text">${esc(r.info.description)}</p>${type==='inspect'?'<label>现场结果<select name="result"><option>整改到位</option><option>仍存在</option><option>持续未整改</option><option>整改后反弹</option></select></label>'+scoreInput():''}${type==='review'?'<label>审核结论<select name="decision"><option value="approve">复核通过</option><option value="return">退回补充</option></select></label>':''}<label>说明${type==='inspect'?'（认定反弹须说明上次整改依据）':''}<textarea name="note" maxlength="3000" required></textarea></label>${type!=='review'?photoInput():''}<button class="btn btn-primary">确认提交</button><button type="button" class="btn btn-gray" data-action="back">返回</button></form>`;$('#eventForm').onsubmit=e=>{e.preventDefault();run(async()=>{const f=e.target,d=new FormData(f),event={type:type==='review'?d.get('decision'):type,by:S.uid,at:stamp(),note:clean(d.get('note'))};if(type==='inspect'){Object.assign(event,scoreValue(d),{result:d.get('result')});if(event.result==='整改到位')event.score=0;}if(type!=='review'){const ps=await photos(f);if(ps.length)event.photos=ps;}await db(`v2/issues/${S.period}/${S.branch}/${id}`,'PATCH',{head:s.count+1,['events/e'+(s.count+1)]:event});await load();msg('已保存。整改提交需由检查人员复核后才算通过。');});};}
function renderQR(){if(!editor())return;$('#content').innerHTML='<div class="qr-wrap"><h3>网点专属整改入口</h3><p class="muted">二维码包含本网点整改权限，请只发给对应网点。季度切换后请重新生成。</p><div class="qr-grid" id="qrgrid"></div><button class="btn btn-outline no-print" data-action="print">打印二维码</button></div>';for(const [b,v]of Object.entries(S.branches)){const u=new URL(location.href);u.search='';u.hash='';u.searchParams.set('branch',b);u.searchParams.set('period',S.period);u.searchParams.set('mode','rectify');u.hash='branch='+accessSession.spaces[b];const q=qrcode(0,'M');q.addData(u.href);q.make();const div=document.createElement('div');div.className='qr-item';div.innerHTML=q.createImgTag(4,12)+`<div class="qn">${W.displayCode(b)} ${esc(v.name)}</div>`;const link=document.createElement('a');link.href=u.href;link.textContent='打开 / 复制入口';div.append(link);$('#qrgrid').append(div);}}
function renderSummary(){const rows=Object.values(S.records).filter(r=>r.info),sum=rows.reduce((a,r)=>a+W.state(r).score,0);$('#content').innerHTML=`<div class="new-form"><h3>${S.period} · ${W.displayCode(S.branch)} ${esc(S.branches[S.branch].name)}</h3><p>问题${rows.length}条，本季合计${sum}分</p><p class="muted">网点查收：${Object.keys(S.receipts||{}).length?'已确认查收':'未确认'}（不代表整改通过）</p><div class="tools no-print"><button data-action="excel">本网点Excel</button><button data-action="report">本网点照片报告</button>${editor()?'<button data-action="overview">查看全部网点进度</button><button data-action="allExcel">授权网点汇总Excel</button>':''}${S.profile.role==='admin'?`<button data-action="backup">下载本季业务备份</button><button data-action="import">导入本季明细</button><button data-action="carryAll">批量生成上季扣分回头看</button><button data-action="lock">${locked()?'解除本季锁定':'锁定本季'}</button><button data-action="period">新建季度</button>`:''}</div><p class="muted">导入只写入当前未锁定季度；历史资料未提供整改结果的，不自动标为通过。</p></div>${cards()}`;}
function download(blob,name){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
function excel(data){const rows=[['季度','网点代号','网点简称','问题编号','问题类别','问题描述','来源季度','当前状态','本季扣分','最后说明']];for(const [b,records]of Object.entries(data))for(const[id,r]of Object.entries(records||{})){if(!r.info)continue;const s=W.state(r);rows.push([S.period,b,S.branches[b].name,id,r.info.category,r.info.description,r.info.sourcePeriod,s.status,s.score,s.last?.note||''].map(W.safeCell));}const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(rows),'检查整改明细');XLSX.writeFile(book,`检查整改_${S.period}.xlsx`);}
async function allData(){const result={};for(const b of Object.keys(S.branches))result[b]=await db(`v2/issues/${S.period}/${b}`)||{};return result;}
let importPlan=null;
function importForm(){
  if(S.profile?.role!=='admin')throw Error('只有管理员可以导入');
  importPlan=null;
  $('#content').innerHTML=`<div class="new-form"><h3>导入 ${esc(S.period)} 问题明细</h3><p class="muted">仅导入当前季度，季度锁定时不可写入。表头须含“机构号、问题类别、问题描述、扣分值”；合并单元格形式的机构号会向下沿用。扣分填负数，提醒填“提醒”。</p><label>Excel 文件<input id="importFile" type="file" accept=".xlsx,.xls" required></label><label>导入范围<select id="importScope"><option value="deductions">仅扣分问题</option><option value="all">扣分问题与提醒</option></select></label><div class="tools"><button data-action="importTemplate">下载空白模板</button><button id="previewImport" class="btn btn-outline">核对预览</button><button class="btn btn-gray" data-action="back">返回</button></div><div id="importPreview"></div></div>`;
  $('#previewImport').onclick=()=>run(previewImport);
  for(const id of ['#importFile','#importScope'])$(id).onchange=()=>{importPlan=null;$('#importPreview').replaceChildren();};
}
function importTemplate(){const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['机构号','问题类别','问题描述','扣分值']]),'季度问题明细');XLSX.writeFile(book,'季度问题导入模板.xlsx');}
async function previewImport(){
  if(S.profile?.role!=='admin'||locked())throw Error('请先切换到未锁定季度，再导入');
  const file=$('#importFile')?.files?.[0];if(!file||file.size>10*1024*1024)throw Error('请选择10MB以内的Excel文件');
  const buffer=await file.arrayBuffer(),book=XLSX.read(buffer,{type:'array'});
  let parsed=null;
  for(const name of book.SheetNames){try{parsed=window.InspectionImport.parseRows(XLSX.utils.sheet_to_json(book.Sheets[name],{header:1,defval:null,raw:true,blankrows:true}),S.branches);break;}catch(e){if(!e.message.includes('缺少'))throw e;}}
  if(!parsed)throw Error('找不到含规定表头的工作表');
  if(parsed.errors.length){$('#importPreview').innerHTML=`<p class="notice">有${parsed.errors.length}行未通过校验，未导入任何记录：</p><p>${parsed.errors.slice(0,20).map(esc).join('<br>')}</p>`;importPlan=null;return;}
  const rows=parsed.rows.filter(r=>$('#importScope').value==='all'||r.kind==='扣分');
  if(!rows.length)throw Error('按当前范围没有可导入的问题');
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))).map(v=>v.toString(16).padStart(2,'0')).join('').slice(0,20);
  const existing={};for(const b of new Set(rows.map(r=>r.branch)))existing[b]=await db(`v2/issues/${S.period}/${b}`)||{};
  const seen=new Set(),planned=[],duplicates=[];
  for(const row of rows){const id=`imp_${digest}_${row.line}`,key=window.InspectionImport.rowKey(row);const matching=Object.entries(existing[row.branch]).find(([,r])=>r.info&&window.InspectionImport.rowKey({branch:row.branch,...r.info})===key);if(existing[row.branch][id]&&!matching)throw Error(`第${row.line}行与线上已有编号冲突，请停止导入并核对`);if(matching||seen.has(key)){duplicates.push(row);continue;}seen.add(key);planned.push({...row,id});}
  importPlan={period:S.period,rows:planned,sourceName:file.name};
  const score=planned.reduce((n,r)=>n+r.score,0);
  $('#importPreview').innerHTML=`<p>读取${rows.length}条；已有或表内重复${duplicates.length}条；拟新增${planned.length}条，扣分合计${score}分，涉及${new Set(planned.map(r=>r.branch)).size}个网点。</p><p class="muted">来源：${esc(file.name)}。不会覆盖已有问题；缺少整改结果时保持“历史状态未提供”。请先核对下表，再确认写入。</p><div class="tools"><button id="commitImport" class="btn btn-primary" ${planned.length?'':'disabled'}>确认导入 ${planned.length} 条</button></div><div class="summary-list">${planned.map(r=>`<div class="summary-item">${esc(W.displayCode(r.branch))} ${esc(S.branches[r.branch].name)} · ${esc(r.category)} · ${esc(r.description)} · ${r.score}</div>`).join('')}</div>`;
  $('#commitImport').onclick=()=>run(commitImport);
}
async function commitImport(){
  const plan=importPlan;if(S.profile?.role!=='admin'||!plan||plan.period!==S.period||locked())throw Error('导入预览已失效，请重新核对');
  if(!confirm(`确定将${plan.rows.length}条问题写入${plan.period}？此操作不会覆盖已有记录。`))return;
  let done=0;
  try{for(const row of plan.rows){const path=`v2/issues/${plan.period}/${row.branch}/${row.id}`;if(await db(path))throw Error(`第${row.line}行线上已有相同编号`);await db(path+'/info','PUT',{description:row.description,category:row.category,kind:row.kind,score:row.score,sourcePeriod:'',historical:true,createdBy:S.uid,createdAt:stamp()});done++;}}
  catch(e){importPlan=null;await load();throw Error(`已写入${done}条，后续中止：${e.message}。重新预览会跳过已导入项。`);}
  importPlan=null;await load();msg(`已导入${done}条${plan.period}问题。历史状态未提供；下一季度可从“回头看”选择带入。`);
}
let bulkCarryPlan=null;
async function bulkCarry(){
  if(S.profile?.role!=='admin'||locked())throw Error('只有管理员可在未锁定季度批量生成回头看');
  const source=Object.keys(S.periods).filter(q=>q<S.period).sort().at(-1);
  if(!source)throw Error('没有上季度可供回头看');
  const rows=[],conflicts=[];let skipped=0;
  const codes=Object.keys(S.branches).sort();
  for(let start=0;start<codes.length;start+=6){
    const group=codes.slice(start,start+6);
    const pair=await Promise.all(group.map(async branch=>({branch,old:await db(`v2/issues/${source}/${branch}`)||{},current:await db(`v2/issues/${S.period}/${branch}`)||{}})));
    for(const {branch,old,current} of pair){
      for(const [id,issue] of Object.entries(old)){
        if(!issue.info||!Number.isFinite(W.state(issue).score)||W.state(issue).score>=0)continue;
        if(current[id]){if(current[id].info?.description!==issue.info.description||current[id].info?.category!==issue.info.category)conflicts.push(`${W.displayCode(branch)} / ${id}`);else skipped++;continue;}
        if(Object.values(current).some(r=>r.info?.description===issue.info.description&&r.info?.category===issue.info.category)){skipped++;continue;}
        rows.push({branch,id,issue});
      }
    }
  }
  if(conflicts.length)throw Error(`发现${conflicts.length}个编号冲突（如 ${conflicts[0]}），请先人工核对，未写入。`);
  bulkCarryPlan={source,target:S.period,rows};
  $('#content').innerHTML=`<div class="new-form"><h3>${esc(source)} → ${esc(S.period)} 批量回头看</h3><p>拟生成${rows.length}条，已存在或同内容跳过${skipped}条，涉及${new Set(rows.map(r=>r.branch)).size}个网点。</p><p class="muted">仅选择上季度最终扣分小于0的问题；本季度全部从0分和“未认定”开始，整改状态不自动判定。不会覆盖已有记录。</p><div class="tools"><button id="commitBulkCarry" class="btn btn-primary" ${rows.length?'':'disabled'}>确认生成${rows.length}条</button><button class="btn btn-gray" data-action="back">返回</button></div></div>`;
  $('#commitBulkCarry').onclick=()=>run(commitBulkCarry);
}
async function commitBulkCarry(){
  const plan=bulkCarryPlan;if(S.profile?.role!=='admin'||!plan||plan.target!==S.period||locked())throw Error('回头看预览已失效，请重新核对');
  if(!confirm(`确定将${plan.source}的${plan.rows.length}条扣分问题带入${plan.target}？本季初始扣分为0。`))return;
  let done=0;
  try{for(const {branch,id,issue} of plan.rows){const path=`v2/issues/${plan.target}/${branch}/${id}`;if(await db(path))throw Error(`${W.displayCode(branch)} / ${id}线上已有记录`);await db(path+'/info','PUT',W.carryInfo(issue,plan.source,S.uid));done++;}}
  catch(e){bulkCarryPlan=null;await load();throw Error(`已生成${done}条，后续中止：${e.message}。请重新预览，已生成项会跳过。`);}
  bulkCarryPlan=null;await load();msg(`已生成${done}条回头看问题，本季扣分从0开始。`);
}
let carryRows={};
async function carry(){if(!editor()||locked())throw Error('当前季度不可生成回头看');const qs=Object.keys(S.periods).filter(q=>q<S.period).sort().reverse();if(!qs.length)throw Error('没有可带入的历史季度');$('#content').innerHTML=`<div class="new-form"><h3>选择回头看问题</h3><select id="source">${qs.map(q=>`<option>${q}</option>`).join('')}</select><label>关键词<input id="keyword" placeholder="按问题文字筛选"></label><label>历史状态<select id="carryState"><option value="">全部</option><option>待整改</option><option>待复核</option><option>退回补充</option><option>复核通过</option><option>现场已到位</option><option>未检查</option><option>历史状态未提供</option></select></label><button class="btn btn-outline" id="findCarry">查询</button><p class="muted">查询会清除上次勾选。只生成下方明确勾选的问题，历史记录保持不变。</p><div id="carryRows"></div><button class="btn btn-primary" id="makeCarry">生成勾选问题</button><button class="btn btn-gray" data-action="back">返回</button></div>`;$('#findCarry').onclick=()=>run(async()=>{const src=$('#source').value,kw=$('#keyword').value.trim(),status=$('#carryState').value;carryRows=await db(`v2/issues/${src}/${S.branch}`)||{};$('#carryRows').dataset.source=src;$('#carryRows').innerHTML=Object.entries(carryRows).filter(([id,r])=>r.info&&!S.records[id]&&(!kw||r.info.description.includes(kw))&&(!status||W.state(r).status===status)).map(([id,r])=>`<label><input type="checkbox" value="${esc(id)}" class="carryChoice"> ${esc(r.info.description)} <small>(${esc(W.state(r).status)})</small></label>`).join('')||'没有符合条件、且尚未带入的问题。';});$('#makeCarry').onclick=()=>run(async()=>{const src=$('#carryRows').dataset.source,ids=Array.from(document.querySelectorAll('.carryChoice:checked')).map(x=>x.value);if(!ids.length)throw Error('请先查询并勾选问题');let done=0;try{for(const id of ids){await db(`v2/issues/${S.period}/${S.branch}/${id}/info`,'PUT',W.carryInfo(carryRows[id],src,S.uid));done++;}}catch(e){await load();throw Error(`已生成${done}条，其余未确认。请重新查询，已生成项会自动排除。`);}await load();msg(`已生成${done}条回头看问题。本季扣分从0开始。`);});}
$('#content').onclick=e=>{const im=e.target.closest('[data-enlarge]');if(im){const d=document.createElement('dialog'),pic=document.createElement('img');pic.src=im.src;pic.style='max-width:85vw;max-height:85vh';d.append(pic);d.onclick=()=>{d.close();d.remove();};document.body.append(d);d.showModal();return;}const b=e.target.closest('[data-action]');if(!b||S.busy)return;const a=b.dataset.action;if(['inspect','submit','review'].includes(a)){eventForm(b.dataset.id,a);return;}if(a==='back'){render();return;}run(async()=>{if(a==='import')importForm();if(a==='importTemplate')importTemplate();if(a==='carry')await carry();if(a==='excel')excel({[S.branch]:S.records});if(a==='allExcel')excel(await allData());if(a==='report'){$('#content').innerHTML=`<div class="new-form"><h3>${S.period} ${W.displayCode(S.branch)} ${esc(S.branches[S.branch].name)} 检查整改报告</h3><button class="btn btn-outline no-print" data-action="print">打印 / 保存PDF</button><button class="btn btn-gray no-print" data-action="back">返回</button></div>`+cards();document.querySelectorAll('details').forEach(d=>d.open=true);}if(a==='print')window.print();if(a==='receipt'){await db(`v2/receipts/${S.period}/${S.branch}/${crypto.randomUUID()}`,'PUT',{by:S.uid,at:stamp()});await load();msg('已记录网点查收确认；查收不等于整改通过。');}if(a==='overview'){const all=await allData();$('#content').innerHTML='<div class="new-form"><h3>授权网点汇总</h3><button class="btn btn-gray" data-action="back">返回</button></div>'+Object.entries(all).map(([code,records])=>{const list=Object.values(records||{}).filter(r=>r.info),pass=list.filter(r=>['复核通过','现场已到位'].includes(W.state(r).status)).length;return `<div class="summary-item"><div class="s-info"><div class="s-name">${W.displayCode(code)} ${esc(S.branches[code].name)}</div><div class="s-meta">问题${list.length}条 · 待复核${list.filter(r=>W.state(r).status==='待复核').length}条 · 通过/现场到位${pass}条 · 本季${list.reduce((n,r)=>n+W.state(r).score,0)}分</div></div></div>`;}).join('');}if(a==='backup'){const issues=await allData(),receipts={};for(const b of Object.keys(S.branches))receipts[b]=await db(`v2/receipts/${S.period}/${b}`)||{};download(new Blob([JSON.stringify({period:S.period,branches:S.branches,issues,receipts},null,2)],{type:'application/json'}),`业务备份_${S.period}.json`);msg('已下载本季问题、照片和历史；此文件不含检查进入码或整改链接；完整备份由维护人员执行。');}if(a==='lock'){if(confirm(`确定${locked()?'解锁':'锁定'}${S.period}？`)){await db(`v2/periods/${S.period}`,'PUT',{locked:!locked()});await load();}}if(a==='period'){const q=prompt('新季度，例如2027-Q1');if(!q)return;if(!/^20\d{2}-Q[1-4]$/.test(q)||S.periods[q])throw Error('季度格式不正确或已存在');await db('v2/periods/'+q,'PUT',{locked:false});S.periods[q]={locked:false};$('#period').insertAdjacentHTML('afterbegin',`<option value="${q}">${q}</option>`);msg('季度已创建，请在上方切换。');}});};
$('#content').addEventListener('click',e=>{if(!e.target.closest('[data-action="carryAll"]'))return;e.preventDefault();e.stopPropagation();if(!S.busy)run(bulkCarry);},true);
window.addEventListener('offline',()=>msg('网络已断开。请保留尚未提交的表单，恢复网络后再提交；页面不会假报保存成功。'));
if(location.protocol==='file:')msg('请勿直接双击打开网页；请使用本地预览地址或正式网址登录。');
