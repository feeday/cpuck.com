/* CPuck AI operator: runs inside the existing workbook; no new worksheet is created. */
(function () {
"use strict";
const C = window.CPuck;
if (!C) return;
const $ = id => document.getElementById(id);
const html = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const LIMIT_ROWS = 15000, LIMIT_BYTES = 8 * 1024 * 1024;
let attachments = [], pending = null, prepared = null, busy = false;
const style = document.createElement("style");
style.textContent = ".aiop-dialog{border:0;border-radius:16px;box-shadow:0 20px 70px #0004;padding:0;width:min(850px,96vw);max-height:94dvh;color:#1c2637;background:white}.aiop-dialog::backdrop{background:#121c30a8}.aiop-wrap{padding:20px;max-height:90dvh;overflow:auto}.aiop-head{display:flex;align-items:center;justify-content:space-between;gap:8px}.aiop-head h2{margin:0;font-size:20px}.aiop-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.aiop-field{display:block;font-size:13px;font-weight:600;margin:10px 0}.aiop-field input,.aiop-field textarea{display:block;width:100%;box-sizing:border-box;margin-top:5px;padding:10px;border:1px solid #cbd5e1;border-radius:8px;font:inherit}.aiop-field textarea{min-height:95px;resize:vertical}.aiop-note{font-size:12px;color:#64748b;line-height:1.6;margin:7px 0}.aiop-actions{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0}.aiop-actions button{border:1px solid #bec9d9;padding:10px 14px;border-radius:8px;background:#fff;cursor:pointer}.aiop-actions button.primary{background:#2857c3;color:#fff;border-color:#2857c3}.aiop-actions button:disabled{opacity:.5;cursor:wait}.aiop-output{white-space:pre-wrap;overflow:auto;max-height:300px;font-size:12px;line-height:1.55;background:#f4f6fa;padding:12px;border-radius:9px;color:#25344b}.aiop-status{font-size:13px;min-height:20px}.aiop-hidden{display:none!important}@media(max-width:600px){.aiop-grid{grid-template-columns:1fr}.aiop-wrap{padding:13px}.aiop-dialog{max-height:95dvh}}";
document.head.appendChild(style);
const modal = document.createElement("dialog");
modal.id="aiopModal"; modal.className="aiop-dialog";
modal.innerHTML = '<div class="aiop-wrap"><div class="aiop-head"><h2>AI 表格操作员</h2><button id="aiopClose" type="button">关闭</button></div>' +
'<p class="aiop-note">直接操作当前工作表，不新建工作表。导入的第二份文件只用于关联匹配。执行前必须预览，写入后可用原有“撤销 / 重做”恢复。</p>' +
'<div class="aiop-grid"><label class="aiop-field">Chat Completions API 地址<input id="aiopUrl" spellcheck="false" value="https://api.poixe.com/v1/chat/completions"></label><label class="aiop-field">模型名称<input id="aiopModel" spellcheck="false" placeholder="输入提供商支持的模型 ID"></label></div>' +
'<label class="aiop-field">API Key（本次使用，不保存）<input id="aiopKey" type="password" autocomplete="off" placeholder="sk-..."></label>' +
'<label class="aiop-field">上传对照文件（可多选，Excel / CSV / TSV / JSON）<input type="file" id="aiopFiles" multiple accept=".xlsx,.xls,.csv,.tsv,.json"></label><div id="aiopFileInfo" class="aiop-note">未选择对照文件；可以直接处理当前工作表。</div>' +
'<label class="aiop-field">一句话描述要求<textarea id="aiopTask" placeholder="例：以当前表A列ID匹配第二个文件的A列，取对照表E列写入当前表B列，从第6行开始；未匹配留空，重复ID列出。"></textarea></label>' +
'<label class="aiop-note"><input id="aiopJsonMode" type="checkbox" checked> 请求 JSON 模式（第三方 API 不支持时可关闭）</label>' +
'<div class="aiop-actions"><button type="button" id="aiopGenerate" class="primary">发送 API · 生成预览</button><button type="button" id="aiopApply" disabled>确认执行到原表</button><button type="button" id="aiopPython" disabled>下载 Python 脚本</button><button type="button" id="aiopUndo">撤销</button><button type="button" id="aiopRedo">重做</button></div>' +
'<p id="aiopStatus" class="aiop-status" role="status"></p><pre id="aiopPreview" class="aiop-output">上传文件并描述目标后，AI 将返回 JSON 操作方案。完整表格保留在本机，仅发送列结构、必要数据样本；数据很小时发送全部行。</pre>' +
'<p class="aiop-note">安全说明：数据摘要与指令将发送给所配置的第三方服务；密钥只留在此页面内存。浏览器直连接口需要服务商允许 CORS。正式公开部署如使用站长自己的密钥，请改用带鉴权的服务端代理。</p></div>';
document.body.appendChild(modal);
const ribbon = $("ribbon");
if (ribbon) {
  const group = document.createElement("div");
  group.className = "toolgroup";
  group.innerHTML = '<span class="grouplabel">AI 自动处理</span><button type="button" id="aiopOpen">AI 一句话处理 / Python</button>';
  ribbon.appendChild(group);
}
const say = (value, error=false) => { $("aiopStatus").textContent=String(value); $("aiopStatus").style.color=error?"#b91c1c":"#334155"; };
const busyState = value => { busy=value; $("aiopGenerate").disabled=value; };
const colNumber = (value, headings=[]) => {
  if (Number.isInteger(value)) return value;
  const str=String(value??"").trim();
  if (/^[A-Z]{1,3}$/i.test(str)) return C.cindex(str.toUpperCase());
  const idx=headings.findIndex(h=>String(h).trim().toLowerCase()===str.toLowerCase());
  if(idx>=0)return idx;
  throw Error("无法识别列："+str);
};
const mainRows = () => {
  const sheet=C.sh(), num=Math.max(1,C.used(sheet)), cols=C.COLS;
  const rows=[];
  const sampled=new Set();
  for(let i=0;i<Math.min(num,120);i++)sampled.add(i);
  if(num<=200)for(let i=120;i<num;i++)sampled.add(i);
  else for(let i=Math.max(120,num-5);i<num;i++)sampled.add(i);
  for(const r of sampled){
    const cells=[];
    for(let c=0;c<cols;c++)cells.push(sheet.cells[C.k(r,c)]??"");
    while(cells.length && cells.at(-1)==="")cells.pop();
    rows.push({row:r+1,cells});
  }
  const headings=[];
  for(let c=0;c<cols;c++)headings.push(sheet.cells[C.k(0,c)]??"");
  return {name:sheet.name, total_rows:num, columns:headings, rows, is_complete:num<=200};
};
const csvParse = (source, separator) => {
  const rows=[], out=[]; let cell="", quoted=false;
  for(let i=0;i<source.length;i++){
    const ch=source[i];
    if(ch==='"'){if(quoted && source[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
    else if(ch===separator && !quoted){out.push(cell);cell="";}
    else if((ch==="\n"||ch==="\r")&&!quoted){if(ch==="\r"&&source[i+1]==="\n")i++;out.push(cell);rows.push(out.splice(0));cell="";}
    else cell+=ch;
  }
  if(cell!==""||out.length){out.push(cell);rows.push(out.splice(0));}
  return rows;
};
const getXLSX = () => new Promise((resolve,reject)=>{
  if(window.XLSX){resolve(window.XLSX);return;}
  const script=document.createElement("script");
  script.src="https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";
  script.onload=()=>window.XLSX?resolve(window.XLSX):reject(Error("SheetJS 未加载"));
  script.onerror=()=>reject(Error("Excel 解析库加载失败"));
  document.head.appendChild(script);
});
const parseAttachment = async file => {
  const ext=file.name.split(".").at(-1).toLowerCase(), base={name:file.name,size:file.size,rows:[],columns:[],total_rows:0,large:file.size>LIMIT_BYTES};
  if(base.large)return base;
  if(ext==="csv"||ext==="tsv"){
    const body=await file.text(),first=body.slice(0,body.indexOf("\n")+1);
    base.rows=csvParse(body,ext==="tsv"||first.includes("\t")?"\t":",");
  }else if(ext==="json"){
    const value=JSON.parse(await file.text());
    if(Array.isArray(value)){
      if(value.length && !Array.isArray(value[0])&&typeof value[0]==="object"){
        const keys=[...new Set(value.slice(0,100).flatMap(x=>Object.keys(x)))];
        base.rows=[keys,...value.map(item=>keys.map(key=>String(item[key]??"")))];
      }else base.rows=value.map(row=>Array.isArray(row)?row.map(x=>String(x??"")):[String(row??"")]);
    }else if(Array.isArray(value.sheets)&&value.sheets[0]){
      const sheet=value.sheets[0],entries=Object.entries(sheet.cells||{}),max=Math.min(20000,entries.reduce((m,[k])=>Math.max(m,Number(k.split(":")[0])+1),1));
      base.rows=Array.from({length:max},()=>[]);
      for(const [key,val]of entries){const [r,c]=key.split(":").map(Number);if(r<max&&c<100)base.rows[r][c]=String(val??"");}
    }else throw Error("JSON 需为数据行数组或 CPuck 工作簿备份");
  }else if(ext==="xlsx"||ext==="xls"){
    const XLSX=await getXLSX(),wb=XLSX.read(await file.arrayBuffer(),{type:"array",dense:true,cellDates:false});
    const sheet=wb.Sheets[wb.SheetNames[0]];
    base.rows=XLSX.utils.sheet_to_json(sheet,{header:1,raw:false,defval:""});
    base.sheet=wb.SheetNames[0];
  }else throw Error("不支持文件格式："+ext);
  base.total_rows=base.rows.length;
  base.columns=base.rows[0]||[];
  base.large=base.large || base.total_rows>LIMIT_ROWS;
  return base;
};
const collectInputs = async () => {
  const main=mainRows(),files=[];
  const selected=Array.from($("aiopFiles").files||[]);
  if(selected.length>5)throw Error("一次最多选择 5 个对照文件");
  for(const file of selected)files.push(await parseAttachment(file));
  attachments=files;
  $("aiopFileInfo").textContent=files.length?files.map(f=>f.name+"（"+(f.total_rows?f.total_rows+" 行":(f.size/1048576).toFixed(1)+" MB，超大文件")+")").join("；"):"未选择对照文件";
  const large=main.total_rows>LIMIT_ROWS||files.some(f=>f.large)||/python|百万|十万|脚本/i.test($("aiopTask").value);
  const summaries=files.map(f=>({name:f.name,sheet:f.sheet||"",size_bytes:f.size,total_rows:f.total_rows||"large_file",columns:f.columns,rows:f.rows.length<=200?f.rows:f.rows.slice(0,70),is_complete:f.rows.length<=200 && !f.large,large:f.large}));
  return {main, files:summaries, large, task:$("aiopTask").value.trim()};
};
const systemPrompt =
"You are a spreadsheet planner. Return ONLY a JSON object with fields summary (string), operations (array), python_code (string, optional). " +
"The EXISTING active sheet is the target, NEVER create a new sheet. Operations are selected from: " +
"lookup_fill: {type,source_file,source_key_col,source_value_col,target_key_col,target_col,start_row,end_row,duplicate_policy}; " +
"formula_fill: {type,formula,target_col,start_row,end_row}; " +
"replace: {type,target_col,find,replacement,start_row,end_row}; " +
"set_cells: {type,cells:[{cell,value}]}; " +
"fill_down: {type,source_cell,end_row}; " +
"filter: {type,target_col,term,exact}; " +
"clear_filter: {type}. " +
"Columns are A/B/C... or header names. start_row and end_row are 1-based Excel rows. " +
"For lookup_fill source_file is either the literal string current (for existing working sheet) or exactly an attached filename; duplicate_policy should be 'error' unless user explicitly chose 'first' or 'last'. " +
"Do not invent filenames, cells, columns, rows or data. Keep leading zeros in IDs. Only use listed operations. " +
"If task needs work beyond this browser (large datasets, many millions of cells, complex transformations), return operations [] and python_code as a self-contained complete Python 3 script using pandas or polars, accepting original input filenames as paths, writing a new result file and NEVER deleting/overwriting the source. " +
"Use snippets to understand task, not to hallucinate the full output. In the JSON summary explain what will happen. Output valid JSON.";
const parseResponse = value => {
  let txt=String(value??"").trim().replace(/^\s*\x60\x60\x60(?:json)?\s*/i,"").replace(/\s*\x60\x60\x60$/,"");
  const obj=JSON.parse(txt);
  if(!obj || typeof obj!=="object"||Array.isArray(obj))throw Error("API 未返回 JSON 对象");
  if(!Array.isArray(obj.operations))obj.operations=[];
  if(obj.operations.length>8)throw Error("操作步骤超过 8 项，请拆成多次处理");
  return obj;
};
const shiftFormula = (formula,delta) => String(formula).split(/("(?:[^"]|"")*")/).map(part=>{
  if(part.startsWith('"'))return part;
  return part.replace(/(^|[^A-Za-z0-9_.])(\$?)([A-Za-z]{1,3})(\$?)([1-9]\d*)(?![A-Za-z0-9_])/g,(all,prefix,ca,letters,ra,row)=>{
    if(ra==="$")return all;
    return prefix+ca+letters+ra+String(Math.max(1,+row+delta));
  });
}).join("");
const trimId = x => String(x??"").trim();
const computePlan = plan => {
  if(!plan||!Array.isArray(plan.operations))throw Error("无可执行操作");
  const main=C.sh(), temp={...main.cells},changed=new Map();
  let filterAction=null, explanations=[];
  const index = col => {const n=colNumber(col,mainRows().columns);if(n<0||n>=C.COLS)throw Error("目标列超出当前表格范围："+col);return n;};
  const end = (requested,begin) => {const last=requested==null?C.used(main):Number(requested);if(!Number.isInteger(last)||last> C.MAX||last<begin-1)throw Error("目标行数超过当前网页限制，请下载 Python");return last;};
  const set=(r,c,v)=>{if(r<0||r>=C.MAX||c<0||c>=C.COLS)throw Error("写入区域超限");const key=C.k(r,c),next=String(v??"");if(temp[key]!==next){temp[key]=next;changed.set(key,next);}};
  for(const op of plan.operations){
    if(!op||typeof op!=="object")throw Error("无效操作");
    const type=op.type;
    if(type==="lookup_fill"){
      const isCurrent=op.source_file==="current"||op.source_file===main.name;
      const file=isCurrent?null:attachments.find(x=>x.name===op.source_file);
      if(!isCurrent&&(!file || !file.rows.length || file.large))throw Error("对照文件未完整读取，无法直接匹配。请使用 Python 模式。");
      const sk=isCurrent?index(op.source_key_col):colNumber(op.source_key_col,file.columns),sv=isCurrent?index(op.source_value_col):colNumber(op.source_value_col,file.columns),tk=index(op.target_key_col),tc=index(op.target_col),begin=Number(op.start_row||2),last=end(op.end_row,begin);
      if([sk,sv].some(i=>i<0||i>99))throw Error("对照列不存在");
      const map=new Map(),dups=new Set(),policy=op.duplicate_policy||"error";
      const sourceCount=isCurrent?C.used(main):file.rows.length;
      for(let i=1;i<sourceCount;i++){const row=isCurrent?null:file.rows[i],key=trimId(isCurrent?temp[C.k(i,sk)]:row[sk]),val=String(isCurrent?(temp[C.k(i,sv)]??""):(row[sv]??""));if(!key)continue;if(map.has(key)){dups.add(key);if(policy==="last")map.set(key,val);}else map.set(key,val);}
      if(dups.size && !["first","last"].includes(policy))throw Error("对照表有 "+dups.size+" 个重复 ID；请指定第一条或最后一条，或先去重");
      let hits=0;
      for(let row=begin-1;row<last;row++){
        const key=trimId(temp[C.k(row,tk)]??"");if(key&&map.has(key))hits++;
        set(row,tc,key?(map.get(key)??""):"");
      }
      explanations.push("查找回填："+(last-begin+1)+" 行，命中 "+hits+"，重复ID "+dups.size);
    }else if(type==="formula_fill"){
      const c=index(op.target_col),begin=Number(op.start_row||2),last=end(op.end_row,begin),formula=String(op.formula||"");
      if(!formula.startsWith("="))throw Error("公式必须以 = 开头");
      for(let row=begin-1;row<last;row++)set(row,c,shiftFormula(formula,row-(begin-1)));
      explanations.push("公式向下填充："+(last-begin+1)+" 行");
    }else if(type==="fill_down"){
      const a=C.address(String(op.source_cell||""));if(!a||a.r!==a.r2||a.c!==a.c2)throw Error("源单元格无效");
      const last=end(op.end_row,a.r+1),v=temp[C.k(a.r,a.c)]??"";
      for(let r=a.r+1;r<last;r++)set(r,a.c,v.startsWith("=")?shiftFormula(v,r-a.r):v);
      explanations.push("向下填充："+Math.max(0,last-a.r-1)+" 行");
    }else if(type==="set_cells"){
      if(!Array.isArray(op.cells)||op.cells.length>1000)throw Error("一次最多直接写入 1000 个 AI 返回单元格");
      for(const item of op.cells){const a=C.address(String(item.cell||""));if(!a||a.r!==a.r2||a.c!==a.c2)throw Error("无效单元格 "+item.cell);set(a.r,a.c,item.value);}
      explanations.push("AI 指定单元格："+op.cells.length+" 项");
    }else if(type==="replace"){
      const c=index(op.target_col),begin=Number(op.start_row||2),last=end(op.end_row,begin),needle=String(op.find??"");
      if(!needle)throw Error("查找内容不可为空");
      let count=0;
      for(let r=begin-1;r<last;r++){
        const key=C.k(r,c),old=temp[key]??"",replacement=String(op.replacement??"");
        if(old.includes(needle)){set(r,c,old.split(needle).join(replacement));count++;}
      }
      explanations.push("查找替换："+count+" 个单元格");
    }else if(type==="filter"){
      const c=index(op.target_col),term=String(op.term??"");
      filterAction={col:c,term,exact:!!op.exact};
      explanations.push("按 "+C.cname(c)+" 列筛选");
    }else if(type==="clear_filter"){
      filterAction=false;explanations.push("清除筛选");
    }else throw Error("不支持的操作："+type+"；可要求 API 返回 Python");
  }
  const list=Array.from(changed,([k,v])=>({k,v}));return {changes:list,filterAction,explanations};
};
const renderPlan = (plan,shape) => {
  const details=[];
  details.push("AI 理解："+String(plan.summary||"未提供摘要"));
  details.push("当前工作表："+C.sh().name+"；行数："+shape.main.total_rows);
  if(shape.large)details.push("数据量较大：建议下载 Python 脚本，本网页不进行大规模回填。");
  if(prepared){details.push(...prepared.explanations);details.push("将修改 "+prepared.changes.length+" 个单元格（不会新建工作表）");
    for(const change of prepared.changes.slice(0,15)){
      const [r,c]=change.k.split(":").map(Number);
      details.push(C.cname(c)+(r+1)+"："+String(C.sh().cells[change.k]??"").slice(0,42)+" → "+String(change.v).slice(0,42));
    }
  }
  if(plan.python_code)details.push("已附带 Python 代码，可点击“下载 Python 脚本”。");
  details.push("\nAPI JSON 原始方案：\n"+JSON.stringify({summary:plan.summary,operations:plan.operations},null,2).slice(0,12000));
  $("aiopPreview").textContent=details.join("\n");
};
async function generate(){
  if(busy)return;
  const url=$("aiopUrl").value.trim(),model=$("aiopModel").value.trim(),key=$("aiopKey").value.trim();
  if(!/^https:\/\//i.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(url))throw Error("API 地址必须为 HTTPS（本地 localhost 可用 HTTP）");
  if(!model||!key)throw Error("请填写模型名称及 API Key");
  if(!$("aiopTask").value.trim())throw Error("请先输入任务要求");
  busyState(true); pending=null;prepared=null;$("aiopApply").disabled=true;$("aiopPython").disabled=true;
  try{
    say("正在分析本地数据结构…");
    const shape=await collectInputs();
    say("正在调用第三方 AI API…");
    const payload={model,messages:[{role:"system",content:systemPrompt},{role:"user",content:"Please return JSON operation plan based on these actual spreadsheet facts:\n"+JSON.stringify(shape)}]};
    if($("aiopJsonMode").checked)payload.response_format={type:"json_object"};
    const response=await fetch(url,{method:"POST",headers:{"Authorization":"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify(payload)});
    const raw=await response.text();
    let data;try{data=JSON.parse(raw)}catch{throw Error("API 返回非 JSON："+raw.slice(0,200));}
    if(!response.ok)throw Error("API HTTP "+response.status+"："+String(data.error?.message||data.message||raw).slice(0,280));
    const message=data.choices?.[0]?.message?.content;
    if(typeof message!=="string")throw Error("API 返回格式不支持，预期 choices[0].message.content");
    const plan=parseResponse(message);
    pending=plan;
    if(!shape.large && plan.operations.length)prepared=computePlan(plan);
    $("aiopApply").disabled=!prepared || (!prepared.changes.length&&prepared.filterAction===null);
    $("aiopPython").disabled=typeof plan.python_code!=="string"||!plan.python_code.trim();
    renderPlan(plan,shape);
    say(shape.large?"已生成方案；大数据请下载 Python，在本机执行。":"方案已生成，请先核对预览，再决定是否回填原表。");
  }finally{busyState(false);}
}
function applyPlan(){
  if(!prepared)throw Error("请先生成并预览方案");
  if(!confirm("确认按预览结果修改当前工作表？所有单元格改动会合并为一次可撤销操作。"))return;
  const count=prepared.changes.length;
  if(count)C.apply(prepared.changes);
  if(prepared.filterAction!==null){C.sh().filter=prepared.filterAction||null;C.render();}
  say("执行完成：修改 "+count+" 个单元格。可以点击原工具栏“撤销”恢复。");
  $("aiopApply").disabled=true;prepared=null;
}
function downloadPython(){
  const code=String(pending?.python_code||"").trim();
  if(!code)throw Error("API 未返回 Python 脚本，请在任务中明确要求生成 Python");
  const blob=new Blob([code+"\n"],{type:"text/x-python;charset=utf-8"});
  const link=document.createElement("a"),url=URL.createObjectURL(blob);
  link.href=url;link.download="CPuck_AI_批量处理.py";document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
  say("已下载 Python。请先检查路径、依赖和操作逻辑，再在本机运行。");
}
$("aiopOpen")?.addEventListener("click",()=>modal.showModal());
$("aiopClose").addEventListener("click",()=>modal.close());
$("aiopGenerate").addEventListener("click",()=>generate().catch(err=>say(err.message||"请求失败",true)));
$("aiopApply").addEventListener("click",()=>{try{applyPlan();}catch(err){say(err.message,true);}});
$("aiopPython").addEventListener("click",()=>{try{downloadPython();}catch(err){say(err.message,true);}});
$("aiopUndo").addEventListener("click",()=>C.undoRedo("undo"));
$("aiopRedo").addEventListener("click",()=>C.undoRedo("redo"));
$("aiopFiles").addEventListener("change",()=>{
  attachments=[];pending=null;prepared=null;$("aiopApply").disabled=true;$("aiopPython").disabled=true;
  const files=Array.from($("aiopFiles").files||[]);
  $("aiopFileInfo").textContent=files.length?files.map(f=>f.name+" ("+(f.size/1048576).toFixed(2)+" MB)").join("；"):"未选择对照文件";
});
})();
