(function(root){
"use strict";
const C=root.CPuck,$=id=>document.getElementById(id),s=C.sh,norm=C.norm,k=C.k;
let runner=null;
const field=(id,label,v)=>'<label>'+C.esc(label)+'<input id="'+id+'" value="'+C.esc(v)+'" spellcheck="false" autocomplete="off"></label>';
const choice=(id,label,items)=>'<label>'+C.esc(label)+'<select id="'+id+'">'+items.map(x=>'<option value="'+C.esc(x[0])+'">'+C.esc(x[1])+'</option>').join("")+'</select></label>';
const note=(text,warn=false)=>'<div class="note'+(warn?" warning":"")+'">'+text+'</div>';
const val=id=>$(id).value.trim();
const col=id=>{const t=val(id).toUpperCase(),n=C.cindex(t);if(!/^[A-Z]{1,3}$/.test(t)||n<0||n>=C.COLS)throw Error("列名无效："+t+"（最大 AN 列）");return n};
const from=()=>{const n=Number(val("fromRow"));if(!Number.isInteger(n)||n<1||n>C.MAX)throw Error("请输入正确的数据开始行");return n-1};
const start=field("fromRow","数据开始行（第 1 行作为标题）","2");
const len=c=>C.usedInColumn(c);
const get=(r,c)=>C.format(C.value(s(),r,c));
function collect(c,begin){const result=[];for(let r=begin;r<len(c);r++){const v=get(r,c);if(v!=="")result.push(v)}return result}
function open(title,body,callback,label="执行"){runner=callback;$("dialogTitle").textContent=title;$("dialogEyebrow").textContent="WORKSHEET ACTION";$("dialogContent").innerHTML=body;$("dialogRun").hidden=!callback;$("dialogRun").textContent=label;$("dialogCancel").textContent=callback?"取消":"关闭";$("toolDialog").showModal()}
function changesForCol(c,arr,begin,clearTo){const out=[];for(let r=begin;r<Math.max(clearTo,begin+arr.length);r++)out.push({k:k(r,c),v:arr[r-begin]??""});return out}
function matchAction(left,query,dest,begin,mode){if(new Set([left,query,dest]).size!==3)throw Error("源列、名单列、结果列必须不同");const set=new Set(collect(query,begin).map(norm)),changes=[];let hits=0;const last=Math.max(len(left),len(dest));for(let r=begin;r<last;r++){const v=r<len(left)?get(r,left):"",hit=v!==""&&set.has(norm(v));if(hit)hits++;changes.push({k:k(r,dest),v:mode==="label"?(v?(hit?"存在":"不存在"):""):hit?v:""})}C.apply(changes);C.message("完成：命中 "+hits+" 个 ID，已回填 "+C.cname(dest)+" 列对应行")}
function compareAction(left,right,dest,begin,mode){if([left,right].includes(dest))throw Error("输出列不能覆盖源数据");const set=new Set(collect(right,begin).map(norm)),changes=[];let both=0,onlyLeft=0;const last=Math.max(len(left),len(dest));for(let r=begin;r<last;r++){let v=r<len(left)?get(r,left):"",hit=v!==""&&set.has(norm(v));if(v){if(hit)both++;else onlyLeft++}changes.push({k:k(r,dest),v:!v?"":hit?(mode==="value"?v:"交集"):"仅左列"})}C.apply(changes);C.message("对比结果：交集 "+both+"，仅左列 "+onlyLeft)}
function uniqueAction(first,second,out1,out2,begin){if([first,second].includes(out1)||(second>=0&&[first,second,out1].includes(out2)))throw Error("结果列不能覆盖输入列");const seen=new Set(),rows=[],last=Math.max(len(first),second>=0?len(second):0);for(let r=begin;r<last;r++){let a=get(r,first),b=second>=0?get(r,second):"";if(!a&&!b)continue;let token=JSON.stringify([norm(a),norm(b)]);if(seen.has(token))continue;seen.add(token);rows.push([a,b])}
const changes=changesForCol(out1,rows.map(r=>r[0]),begin,Math.max(last,len(out1)));if(second>=0)changes.push(...changesForCol(out2,rows.map(r=>r[1]),begin,Math.max(last,len(out2))));C.apply(changes);C.message("得到 "+rows.length+" 个唯一"+(second>=0?"组合":"值"))}
function highlightAction(target,other,type,color,begin){const counts=new Map();for(let r=begin;r<len(target);r++){const v=norm(get(r,target));if(v)counts.set(v,(counts.get(v)||0)+1)}const elsewhere=new Set(collect(other,begin).map(norm)),marks=[];let hit=0;for(let r=begin;r<len(target);r++){const v=norm(get(r,target)),ok=v&&(type==="repeat"?counts.get(v)>1:elsewhere.has(v));if(ok)hit++;marks.push({k:k(r,target),v:ok?color:""})}C.apply([],marks);C.message("已标记 "+hit+" 个单元格")}
function sortedAction(column,begin,desc){const last=C.used();if(last-begin>20000)throw Error("范围过大");const records=[];for(let r=begin;r<last;r++){let raw=[];for(let c=0;c<C.COLS;c++)raw.push(s().cells[k(r,c)]||"");records.push({raw,criterion:get(r,column)})}
records.sort((a,b)=>{const x=a.criterion,y=b.criterion;let d=x!==""&&y!==""&&Number.isFinite(+x)&&Number.isFinite(+y)?+x-(+y):x.localeCompare(y,"zh",{numeric:true});return desc?-d:d});
const changes=[];for(let i=0;i<records.length;i++)for(let c=0;c<C.COLS;c++)changes.push({k:k(i+begin,c),v:records[i].raw[c]});C.apply(changes);C.message("已按 "+C.cname(column)+" 列排序 "+records.length+" 行")}
function splitAction(source,dest,kind,begin){if(source===dest)throw Error("输出列不能是源列");const changes=[];for(let r=begin;r<Math.max(len(source),len(dest));r++){const path=r<len(source)?get(r,source):"",parts=path.split(/[\\/]/),filename=parts.at(-1)||"";let result=kind==="file"?filename:kind==="folder"?(parts.length>1?parts.at(-2):""):kind==="id"?filename.slice(0,5):filename.replace(/\.[^.]+$/,"");changes.push({k:k(r,dest),v:result})}C.apply(changes);C.message("已提取 "+changes.length+" 个路径字段")}
function replaceAllText(text,query,replacement){let output="",start=0,index,needle=query.toLowerCase(),lower=text.toLowerCase();while((index=lower.indexOf(needle,start))!==-1){output+=text.slice(start,index)+replacement;start=index+query.length}return output+text.slice(start)}
const samples=[
["SUM","求和","=SUM(D2:D6)"],["COUNTIF","统计单条件",'=COUNTIF(A2:A6,"00003")'],
["COUNTIFS","统计多个条件",'=COUNTIFS(E2:E6,"Flux",F2:F6,">=80")'],
["SUMIF","条件求和",'=SUMIF(E2:E6,"Flux",D2:D6)'],
["XLOOKUP","根据 ID 返回其他列",'=XLOOKUP("00003",A2:A6,D2:D6,"未找到")'],
["VLOOKUP","根据编号查数量",'=VLOOKUP("00003",A2:D6,4,FALSE)'],
["MATCH","找编号出现的位置",'=MATCH("00003",A2:A6,0)'],
["INDEX","按行列返回值","=INDEX(A2:D6,3,4)"],
["IF","逻辑判断",'=IF(F2>=80,"通过","复核")'],
["IFERROR","发生错误返回备用文本",'=IFERROR(1/0,"异常")'],
["FILTER","筛出符合条件的完整行",'=FILTER(A2:G6,E2:E6="Flux","无")'],
["UNIQUE","去重唯一列表","=UNIQUE(C2:C6)"],
["SORT","数值排序","=SORT(A2:G6,6,-1)"],
["LEFT","提取文件名前五位","=LEFT(A2,5)"],
["RIGHT","提取右侧字符","=RIGHT(A2,3)"],
["TEXTAFTER","路径最后一段",'=TEXTAFTER(A2,"\\",-1)'],
["TEXTBEFORE","指定分隔符之前",'=TEXTBEFORE(A2,"_")'],
["SUBSTITUTE","替换文本",'=SUBSTITUTE(A2,"Original","Edit")'],
["SUMPRODUCT","乘积求和","=SUMPRODUCT(D2:D6,F2:F6)"],
["AVERAGE","求平均","=AVERAGE(F2:F6)"],
["MAX","最大值","=MAX(F2:F6)"],
["MIN","最小值","=MIN(F2:F6)"],
["TEXT","补齐五位编号",'=TEXT(27,"00000")'],
["LEN","计算字符长度","=LEN(A2)"]
];
function show(type){const range=C.rg();
if(type==="match"){open("C 筛 A → B：按原行回填",note("<b>示例：</b>A2=00001，C 列包含 00001 → B2=00001。按照 A 列的原始位置填入 B 列，不重排 A 列。未命中时清空 B。")+'<div class="two">'+field("left","待筛完整数据列","A")+field("right","指定名单列","C")+'</div><div class="two">'+field("out","结果列","B")+start+'</div>'+choice("matchType","输出方式",[["value","写入匹配 ID"],["label","写入 存在/不存在"]]),()=>matchAction(col("left"),col("right"),col("out"),from(),val("matchType")),"执行匹配");return}
if(type==="compare"){open("双列对比 · 交集和差集",note("以左列每条记录所在行为准，把“交集 / 仅左列”写到输出列。")+'<div class="two">'+field("left","左列","A")+field("right","右列","C")+'</div><div class="two">'+field("out","输出列","B")+start+'</div>'+choice("compareType","交集输出形式",[["label","交集 / 仅左列"],["value","交集输出原值"]]),()=>compareAction(col("left"),col("right"),col("out"),from(),val("compareType")),"执行对比");return}
if(type==="unique"){open("唯一值 / 双列组合去重",note("双列模式对“两个字段的组合”去重，单列模式只根据一列去重。输出至新列，不删除原数据。") +choice("uniqueMode","模式",[["single","单列去重"],["pair","双列组合去重"]])+'<div class="two">'+field("from1","第 1 输入列","A")+field("from2","第 2 输入列（双列模式）","C")+'</div><div class="two">'+field("to1","第 1 输出列","H")+field("to2","第 2 输出列（双列模式）","I")+'</div>'+start,()=>uniqueAction(col("from1"),val("uniqueMode")==="pair"?col("from2"):-1,col("to1"),val("uniqueMode")==="pair"?col("to2"):-1,from()),"提取唯一值");return}
if(type==="highlight"){open("高亮重复或跨列命中",note("不修改数据，只给满足条件的格子标底色。") +choice("highMode","规则",[["repeat","本列重复值"],["cross","出现在另一列的值"]])+'<div class="two">'+field("highA","高亮哪一列","A")+field("highB","对照哪一列","C")+'</div>'+choice("color","底色",[["yellow","黄色"],["red","红色"],["green","绿色"]])+start,()=>highlightAction(col("highA"),col("highB"),val("highMode"),val("color"),from()),"高亮标记");return}
if(type==="filter"){open("按列筛选可见行",note("不会删除任何原始行；取消筛选时重新显示全部数据。")+'<div class="two">'+field("filterColumn","按哪列筛选","E")+field("filterQuery","关键词（留空取消）","Flux")+'</div>'+choice("filterType","匹配",[["contains","包含"],["exact","完全相等"]]),()=>{const query=val("filterQuery");s().filter=query?{col:col("filterColumn"),term:query,exact:val("filterType")==="exact"}:null;C.resetCalc();C.render();C.saveSoon();$("gridViewport").scrollTop=0;C.message(query?"筛选已生效":"已取消筛选")},"应用筛选");return}
if(type==="sort"){open("根据指定列给整行排序",note("排序会移动全部列。<b>注意：</b>含复杂跨行公式的表格建议先备份，现有编辑器不会自动重写所有公式的行引用。",true)+'<div class="two">'+field("sortCol","排序依据列","F")+start+'</div>'+choice("sortDir","顺序",[["desc","从大到小"],["asc","从小到大"]]),()=>sortedAction(col("sortCol"),from(),val("sortDir")==="desc"),"排序整行");return}
if(type==="sum"){open("一键求和",note("会在目标单元格插入真正的 SUM 公式；改变源数据后结果将随之更新。")+'<div class="two">'+field("sumCells","求和范围","D2:D6")+field("sumTarget","结果位置","H2")+'</div>',()=>{const p=C.address(val("sumCells")),q=C.address(val("sumTarget"));if(!p||!q)throw Error("请输入有效范围，例如 D2:D6 和 H2");C.setCell(q.r,q.c,"=SUM("+val("sumCells").toUpperCase()+")");C.select(q.r,q.c,q.r,q.c,true);C.message("求和公式已插入")},"插入 SUM");return}
if(type==="find"){open("查找与替换",note("查找可定位到首个原始内容包含关键词的单元格。全部替换会修改当前工作表，请谨慎操作。")+'<div class="two">'+field("findTerm","查找文本","00003")+field("newTerm","替换为","")+'</div>'+choice("findType","操作",[["find","查找定位"],["replace","全部替换"]]),()=>{const term=val("findTerm");if(!term)throw Error("请输入查找内容");const hits=Object.entries(s().cells).filter(([,v])=>v.toLowerCase().includes(term.toLowerCase()));if(val("findType")==="find"){if(!hits.length){C.message("没有匹配项");return}const p=hits[0][0].split(":").map(Number);C.select(p[0],p[1],p[0],p[1],true);C.message("找到 "+hits.length+" 格，已定位首项")}else{const changes=hits.map(([cell,v])=>({k:cell,v:replaceAllText(v,term,$("newTerm").value)}));C.apply(changes);C.message("替换 "+changes.length+" 个单元格")}},"执行");return}
if(type==="split"){open("批量提取文件路径字段",note("兼容 G:\\dataset\\Flux\\DemoA\\00001_Original_Person_DemoA.png 等虚构路径，原文件不受影响。")+'<div class="two">'+field("pathInput","完整路径列","A")+field("pathOutput","结果列","B")+'</div>'+choice("splitType","提取内容",[["file","文件名（含扩展名）"],["folder","上一级文件夹"],["id","文件名前五位编号"],["stem","去掉扩展名"]])+start,()=>splitAction(col("pathInput"),col("pathOutput"),val("splitType"),from()),"提取字段");return}
if(type==="formulas"){open("在线函数助手",note("点击一个公式，直接写入当前选中的单元格。可按实际位置修改 A2、D2 等引用；引擎目前支持 "+root.SheetFormula.functions.length+" 种基础函数。") +field("formulaSearch","搜索函数名称 / 功能","")+'<div class="formulalist" id="formulaList"></div>',null);function listing(){const text=val("formulaSearch").toLowerCase();$("formulaList").innerHTML=samples.map((x,i)=>({x,i})).filter(item=>item.x.join(" ").toLowerCase().includes(text)).map(item=>'<button type="button" data-idx="'+item.i+'" class="formula-item"><strong>'+C.esc(item.x[0])+'</strong><span>'+C.esc(item.x[1])+'</span><code>'+C.esc(item.x[2])+'</code></button>').join("")||'<p>没有符合的公式</p>'}
$("formulaSearch").addEventListener("input",listing);$("formulaList").addEventListener("click",e=>{const b=e.target.closest("[data-idx]");if(!b)return;const item=samples[+b.dataset.idx];C.setCell(C.state.sel.r,C.state.sel.c,item[2]);$("toolDialog").close();C.message("已插入 "+item[0])});listing();return}
if(type==="help"){open("在线表格 · 使用说明",note("<b>电脑：</b>单击选中、双击编辑、拖动框选、Enter 提交、方向键移动、Ctrl+C/V 和 Ctrl+Z/Y。<br><b>手机：</b>点击单元格后在 fx 输入框编辑，按“输入 ↵”保存。<br><b>公式：</b>以 = 开头，可在“函数库”插入。<br><b>备份：</b>通过“导出”保存 Excel/CSV/JSON。<br><b>同步：</b>GitHub Pages 只部署网页代码，不同步浏览器中的私人表格。"),null);return}
if(type==="export"){root.CPuckIO.openExport();return}
}
function execute(name){if(name==="undo"||name==="redo")return C.undoRedo(name);if(name==="copy")return C.copy();if(name==="paste")return C.pasteClipboard();if(name==="clear")return C.clear();if(name==="fill")return C.fillDown();if(name==="import")return $("filePicker").click();if(name==="demo"){if(Object.keys(s().cells).length>12&&!confirm("将替换当前所有工作表，先导出备份？确定要恢复示例吗？"))return;C.replaceBook(C.demo());C.message("已恢复虚构示例");return}show(name)}
function connect(){document.getElementById("ribbon").addEventListener("click",e=>{const b=e.target.closest("[data-action]");if(b)try{execute(b.dataset.action)}catch(err){C.message(err.message)}});
$("dialogClose").addEventListener("click",()=>$("toolDialog").close());$("dialogCancel").addEventListener("click",()=>$("toolDialog").close());
$("dialogRun").addEventListener("click",async()=>{if(!runner)return;try{await runner();if($("toolDialog").open)$("toolDialog").close()}catch(e){C.message("操作失败："+(e.message||"未知错误"))}});
$("helpBtn").addEventListener("click",()=>execute("help"));$("resetDemo").addEventListener("click",()=>execute("demo"));
document.querySelectorAll("[data-example]").forEach(b=>b.addEventListener("click",()=>{const x=b.dataset.example;if(x==="formula")show("formulas");else if(x==="highlight")show("highlight");else{try{matchAction(0,2,1,1,"value");$("gridViewport").scrollIntoView({behavior:"smooth",block:"start"})}catch(e){C.message(e.message)}}}));
}
root.CPuckTools={connect,show,execute,open,matchAction,uniqueAction,compareAction,highlightAction};
})(window);