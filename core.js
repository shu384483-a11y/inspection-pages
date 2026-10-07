/* Shared pure workflow functions; cloud rules independently enforce permissions. */
(function(root){
'use strict';
function events(issue){return Object.entries(issue.events||{}).sort((a,b)=>Number(a[0].slice(1))-Number(b[0].slice(1))).map(x=>x[1]);}
function state(issue){const ev=events(issue),last=ev.at(-1),inspection=[...ev].reverse().find(e=>e.type==='inspect');return {last,inspection,count:ev.length,status:!last?(issue.info.historical?'历史状态未提供':(issue.info.sourcePeriod?'未检查':'待整改')):({inspect:last.result==='整改到位'?'现场已到位':'待整改',submit:'待复核',approve:'复核通过',return:'退回补充'})[last.type],score:inspection?.score??issue.info.score};}
function can(type,issue,role){const s=state(issue),editor=role==='admin'||role==='inspector';if(type==='inspect')return editor&&(!s.last||s.last.type==='inspect');if(type==='submit')return role==='branch'&&((!s.last&&!issue.info.sourcePeriod)||(s.last?.type==='inspect'&&s.last.result!=='整改到位')||s.last?.type==='return');return editor&&s.last?.type==='submit';}
function carryInfo(issue,source,uid){return {description:issue.info.description,category:issue.info.category,kind:'未认定',score:0,sourcePeriod:source,createdBy:uid,createdAt:{'.sv':'timestamp'}};}
function safeCell(v){return typeof v==='string'&&/^[=+@\-\t\r]/.test(v)?"'"+v:v;}
function displayCode(code){const value=String(code??'');return /^961[0-9]{3}$/.test(value)?value.slice(3):value;}
function loginEmail(account,domain){const value=String(account??'').trim();if(/^\d{3}$/.test(value)){if(!/^[a-z0-9.-]+\.invalid$/.test(domain))throw Error('网点账号尚未配置，请联系管理员。');return `branch-${value}@${domain}`;}if(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))return value;throw Error('请输入网点三位账号或管理员邮箱。');}
const api={events,state,can,carryInfo,safeCell,displayCode,loginEmail};root.Inspection=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
