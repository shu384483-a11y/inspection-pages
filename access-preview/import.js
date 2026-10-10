'use strict';
(function(root){
  function parseRows(rows,branches){
    const headerIndex=rows.findIndex(row=>{
      const cells=row.map(v=>String(v??'').trim());
      return cells.includes('机构号')&&cells.includes('问题类别')&&cells.includes('问题描述')&&cells.includes('扣分值');
    });
    if(headerIndex<0)throw Error('表格缺少“机构号、问题类别、问题描述、扣分值”表头。');
    const header=rows[headerIndex].map(v=>String(v??'').trim());
    const col=name=>header.indexOf(name), result=[],errors=[];
    let code='';
    for(let i=headerIndex+1;i<rows.length;i++){
      const row=rows[i]||[];
      const rawCode=row[col('机构号')];
      if(rawCode!==null&&rawCode!==undefined&&String(rawCode).trim())code=String(rawCode).trim();
      const description=String(row[col('问题描述')]??'').trim();
      const category=String(row[col('问题类别')]??'').trim();
      const rawScore=row[col('扣分值')];
      if(!description&&!category&&(rawScore===null||rawScore===undefined||String(rawScore).trim()===''))continue;
      const line=i+1;
      if(!/^\d{6}$/.test(code)||!Object.hasOwn(branches,code)){errors.push(`第${line}行：机构号不在主数据中`);continue;}
      const outletColumn=col('网点');
      const outlet=outletColumn<0?'':String(row[outletColumn]??'').trim();
      const bareName=outlet.replace(/^椒江农商银行/,'');
      const shortName=bareName==='营业部'?bareName:bareName.replace(/支行营业部$/,'').replace(/营业部$/,'').replace(/分理处$/,'').replace(/支行$/,'');
      if(outlet&&shortName!==branches[code].name){errors.push(`第${line}行：网点名称与机构号不一致`);continue;}
      if(!description||description.length>3000||description.includes('农商银行')){errors.push(`第${line}行：问题描述为空、过长或含单位全称`);continue;}
      if(!category||category.length>40){errors.push(`第${line}行：问题类别为空或过长`);continue;}
      let kind,score;
      if(String(rawScore??'').trim()==='提醒'){kind='提醒';score=0;}
      else if(rawScore!==null&&rawScore!==undefined&&String(rawScore).trim()!==''&&Number.isFinite(Number(rawScore))&&Number(rawScore)<0&&Number(rawScore)>=-100){kind='扣分';score=Number(rawScore);}
      else {errors.push(`第${line}行：扣分值必须为负数或“提醒”`);continue;}
      result.push({line,branch:code,category,description,kind,score});
    }
    return {rows:result,errors};
  }
  function rowKey(row){return JSON.stringify([row.branch,row.category,row.description,row.kind,row.score]);}
  const api={parseRows,rowKey};root.InspectionImport=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
