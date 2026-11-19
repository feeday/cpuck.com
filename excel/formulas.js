(function(root){
"use strict";
const fail=s=>{throw Error(s)};
const arr=x=>x&&x.__matrix?x.data.flat():Array.isArray(x)?x.flat(Infinity):[x];
const mat=x=>x&&x.__matrix?x.data:Array.isArray(x)?(Array.isArray(x[0])?x:x.map(y=>[y])):[[x]];
const first=x=>arr(x)[0]??"";
const str=x=>String(first(x)??"");
const num=x=>{const n=Number(first(x));return Number.isFinite(n)?n:0};
const yes=x=>{const v=first(x);return !(v===""||v===false||v===null||v===0)};
const eq=(x,y)=>str(x).toLowerCase()===str(y).toLowerCase();
function cmp(x,y,op){let a=str(x),b=str(y);if(a!==""&&b!==""&&Number.isFinite(+a)&&Number.isFinite(+b)){a=+a;b=+b}else{a=a.toLowerCase();b=b.toLowerCase()}return op==="="?a===b:op==="<>"?a!==b:op===">"?a>b:op==="<"?a<b:op===">="?a>=b:a<=b}
function matches(v,criterion){const s=str(criterion),m=s.match(/^(>=|<=|<>|>|<|=)(.*)$/),operator=m?m[1]:"=",query=m?m[2]:s;if((query.includes("*")||query.includes("?"))&&(operator==="="||operator==="<>")){const glob=query.split("").map(ch=>ch==="*"?".*":ch==="?"?".":/[\\^$+?.()|\[\]{}]/.test(ch)?"\\"+ch:ch).join("");const found=new RegExp("^"+glob+"$","i").test(str(v));return operator==="="?found:!found}return cmp(v,query,operator)}
function coordinate(s){const m=String(s).match(/^\$?([A-Z]+)\$?([1-9]\d*)$/i);if(!m)fail("#REF!");let c=0;for(const k of m[1].toUpperCase())c=c*26+k.charCodeAt(0)-64;return{r:+m[2]-1,c:c-1}}
function tokens(s){const out=[];let i=0;while(i<s.length){let ch=s[i];if(/\s/.test(ch)){i++;continue}if(ch==='"'||ch==="'"){let q=ch,v="",done=false;i++;while(i<s.length){if(s[i]===q){if(s[i+1]===q){v+=q;i+=2;continue}done=true;i++;break}v+=s[i++]}if(!done)fail("#PARSE!");out.push({t:q==="'"?"sheet":"text",v});continue}let m=s.slice(i).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?/);if(m){out.push({t:"number",v:Number(m[0])});i+=m[0].length;continue}m=s.slice(i).match(/^\$?[A-Za-z_]\$?[A-Za-z0-9_.]*/);if(m){out.push({t:"name",v:m[0]});i+=m[0].length;continue}m=s.slice(i).match(/^(?:<=|>=|<>|[+\-*\/^&=<>(),;:!%])/);if(m){out.push({t:m[0],v:m[0]});i+=m[0].length;continue}fail("#PARSE!")}
out.push({t:"end"});return out}
function parse(s){const ts=tokens(s);let i=0;const top=()=>ts[i].t, pop=()=>ts[i++], want=t=>{if(top()!==t)fail("#PARSE!");pop()};
function atom(){const v=pop();if(v.t==="number"||v.t==="text")return{k:"v",v:v.v};if(v.t==="("){let a=expr(0);want(")");return a}if(v.t==="+"||v.t==="-")return{k:"u",op:v.t,a:expr(7)};
if(v.t==="name"||v.t==="sheet"){if(top()==="("){pop();let args=[];if(top()!==")"){do{args.push(expr(0));if(top()!==","&&top()!==";")break;pop()}while(true)}want(")");return{k:"fn",name:v.v.toUpperCase(),args}}
let sheet=null,ref=v.v;if(top()==="!"){pop();sheet=v.v;ref=pop().v}if(/^\$?[A-Z]+$/i.test(ref)&&top()===":"){pop();const to=pop();if(to.t!=="name"||!/^\$?[A-Z]+$/i.test(to.v))fail("#REF!");return{k:"colrange",sheet,a:ref,b:to.v}}if(/^\$?[A-Z]+\$?[1-9]\d*$/i.test(ref)){if(top()===":"){pop();return{k:"range",sheet,a:ref,b:pop().v}}return{k:"ref",sheet,ref}}if(!sheet&&/^(TRUE|FALSE)$/i.test(ref))return{k:"v",v:ref.toUpperCase()==="TRUE"};fail("#NAME? "+ref)}
fail("#PARSE!")}
const priority={"=":1,"<>":1,">":1,"<":1,">=":1,"<=":1,"&":2,"+":3,"-":3,"*":4,"/":4,"^":5};
function expr(min){let l=atom();while(priority[top()]!==undefined&&priority[top()]>=min){const op=pop().t;l={k:"bin",op,a:l,b:expr(priority[op]+(op==="^"?0:1))}}if(top()==="%"&&min===0){pop();l={k:"percent",a:l}}return l}
const ast=expr(0);if(top()!=="end")fail("#PARSE!");return ast}
const functions={
SUM:a=>a.flatMap(arr).reduce((s,v)=>s+num(v),0),
AVERAGE:a=>{const v=a.flatMap(arr).filter(x=>x!==""&&x!==null);return v.length?v.reduce((s,x)=>s+num(x),0)/v.length:fail("#DIV/0!")},
COUNT:a=>a.flatMap(arr).filter(x=>typeof x==="number").length,
COUNTA:a=>a.flatMap(arr).filter(x=>x!==""&&x!==null&&x!==undefined).length,
COUNTBLANK:a=>a.flatMap(arr).filter(x=>x===""||x===null).length,
MAX:a=>Math.max(...a.flatMap(arr).map(num)),MIN:a=>Math.min(...a.flatMap(arr).map(num)),
AVERAGEIFS:a=>{const base=arr(a[0]),out=[];for(let j=0;j<base.length;j++){let ok=true;for(let i=1;i<a.length;i+=2)if(!matches(arr(a[i])[j]??"",a[i+1]))ok=false;if(ok&&base[j]!=="")out.push(num(base[j]))}return out.length?out.reduce((x,y)=>x+y,0)/out.length:fail("#DIV/0!")},
MAXIFS:a=>{const base=arr(a[0]),out=[];for(let j=0;j<base.length;j++){let ok=true;for(let i=1;i<a.length;i+=2)if(!matches(arr(a[i])[j]??"",a[i+1]))ok=false;if(ok)out.push(num(base[j]))}return out.length?Math.max(...out):0},
MINIFS:a=>{const base=arr(a[0]),out=[];for(let j=0;j<base.length;j++){let ok=true;for(let i=1;i<a.length;i+=2)if(!matches(arr(a[i])[j]??"",a[i+1]))ok=false;if(ok)out.push(num(base[j]))}return out.length?Math.min(...out):0},
MEDIAN:a=>{let x=a.flatMap(arr).filter(y=>y!=="").map(num).sort((a,b)=>a-b),m=Math.floor(x.length/2);return x.length?x.length%2?x[m]:(x[m-1]+x[m])/2:fail("#NUM!")},
"RANK.EQ":a=>1+arr(a[1]).map(num).filter(x=>num(a[2]??0)?x<num(a[0]):x>num(a[0])).length,
HLOOKUP:a=>{const matrix=mat(a[1]),i=matrix[0]?.findIndex(x=>eq(x,a[0]))??-1;return i<0?"#N/A":matrix[num(a[2])-1]?.[i]??"#REF!"},
CHOOSECOLS:a=>mat(a[0]).map(row=>a.slice(1).map(i=>row[num(i)-1]??"")),
TAKE:a=>num(a[1])>=0?mat(a[0]).slice(0,num(a[1])):mat(a[0]).slice(num(a[1])),
DROP:a=>num(a[1])>=0?mat(a[0]).slice(num(a[1])):mat(a[0]).slice(0,num(a[1])),
VSTACK:a=>a.flatMap(mat),
HSTACK:a=>{const all=a.map(mat),count=Math.max(...all.map(x=>x.length));return Array.from({length:count},(_,i)=>all.flatMap(x=>x[i]||Array(x[0]?.length||1).fill("")))},
REPT:a=>str(a[0]).repeat(Math.max(0,Math.min(20000,num(a[1])))),
PROPER:a=>str(a[0]).toLowerCase().replace(/\b[a-z]/g,x=>x.toUpperCase()),
SWITCH:a=>{for(let i=1;i<a.length-1;i+=2)if(eq(a[0],a[i]))return a[i+1];return a.length%2===0?a.at(-1):"#N/A"},
ISERROR:a=>typeof a[0]==="string"&&a[0].startsWith("#"),
EOMONTH:a=>{const d=new Date(str(a[0]));return new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+num(a[1])+1,0)).toISOString().slice(0,10)},
EDATE:a=>{const d=new Date(str(a[0]));d.setUTCMonth(d.getUTCMonth()+num(a[1]));return d.toISOString().slice(0,10)},
NETWORKDAYS:a=>{let d=new Date(str(a[0])),end=new Date(str(a[1])),count=0;if(!Number.isFinite(d.getTime()+end.getTime()))fail("#VALUE!");while(d<=end&&count<100000){if(d.getUTCDay()!==0&&d.getUTCDay()!==6)count++;d.setUTCDate(d.getUTCDate()+1)}return count},

COUNTIF:a=>arr(a[0]).filter(v=>matches(v,a[1])).length,
COUNTIFS:a=>{let n=0;const nrow=arr(a[0]).length;for(let j=0;j<nrow;j++){let ok=true;for(let i=0;i<a.length;i+=2)if(!matches(arr(a[i])[j]??"",a[i+1]))ok=false;if(ok)n++}return n},
SUMIF:a=>arr(a[0]).reduce((s,v,i)=>s+(matches(v,a[1])?num(arr(a[2]??a[0])[i]):0),0),
SUMIFS:a=>arr(a[0]).reduce((s,v,j)=>{for(let i=1;i<a.length;i+=2)if(!matches(arr(a[i])[j]??"",a[i+1]))return s;return s+num(v)},0),
SUMPRODUCT:a=>{let xs=a.map(arr),n=Math.max(...xs.map(x=>x.length));return Array.from({length:n},(_,i)=>xs.reduce((p,x)=>p*num(x[i]),1)).reduce((s,x)=>s+x,0)},
AVERAGEIF:a=>{const x=arr(a[0]),out=x.map((v,i)=>matches(v,a[1])?arr(a[2]??a[0])[i]:null).filter(v=>v!==null);return out.length?out.reduce((s,v)=>s+num(v),0)/out.length:fail("#DIV/0!")},
IF:a=>yes(a[0])?a[1]:a[2]??false,IFERROR:a=>a[0],IFNA:a=>a[0],
AND:a=>a.every(yes),OR:a=>a.some(yes),NOT:a=>!yes(a[0]),
LEFT:a=>str(a[0]).slice(0,num(a[1]??1)),RIGHT:a=>str(a[0]).slice(-num(a[1]??1)),
MID:a=>str(a[0]).slice(Math.max(0,num(a[1])-1),Math.max(0,num(a[1])-1)+num(a[2])),
LEN:a=>str(a[0]).length,
SEARCH:a=>{let i=str(a[1]).toLowerCase().indexOf(str(a[0]).toLowerCase(),Math.max(0,num(a[2]??1)-1));return i<0?fail("#VALUE!"):i+1},
FIND:a=>{let i=str(a[1]).indexOf(str(a[0]),Math.max(0,num(a[2]??1)-1));return i<0?fail("#VALUE!"):i+1},
SUBSTITUTE:a=>str(a[0]).split(str(a[1])).join(str(a[2])),
REPLACE:a=>str(a[0]).slice(0,Math.max(0,num(a[1])-1))+str(a[3])+str(a[0]).slice(Math.max(0,num(a[1])-1)+num(a[2])),
TRIM:a=>str(a[0]).trim().replace(/\s+/g," "),CLEAN:a=>str(a[0]).replace(/[\x00-\x1f\x7f]/g,""),
UPPER:a=>str(a[0]).toUpperCase(),LOWER:a=>str(a[0]).toLowerCase(),
CONCAT:a=>a.flatMap(arr).map(str).join(""),CONCATENATE:a=>a.flatMap(arr).map(str).join(""),
TEXTJOIN:a=>a.slice(2).flatMap(arr).filter(v=>!yes(a[1])||str(v)!=="").map(str).join(str(a[0])),
TEXTBEFORE:a=>{let p=str(a[0]).split(str(a[1]));if(p.length===1)fail("#N/A");let n=num(a[2]??1),idx=n<0?p.length+n:n;if(idx<1||idx>=p.length)fail("#N/A");return p.slice(0,idx).join(str(a[1]))},
TEXTAFTER:a=>{let p=str(a[0]).split(str(a[1]));if(p.length===1)fail("#N/A");let n=num(a[2]??1),idx=n<0?p.length+n:n;if(idx<1||idx>=p.length)fail("#N/A");return p.slice(idx).join(str(a[1]))},
TEXTSPLIT:a=>str(a[0]).split(str(a[1])).map(v=>[v]),
EXACT:a=>str(a[0])===str(a[1]),
ROUND:a=>{let p=10**num(a[1]??0);return Math.round((num(a[0])+Number.EPSILON)*p)/p},
ROUNDUP:a=>{let p=10**num(a[1]??0),v=num(a[0]);return Math.sign(v)*Math.ceil(Math.abs(v)*p)/p},
ROUNDDOWN:a=>{let p=10**num(a[1]??0),v=num(a[0]);return Math.sign(v)*Math.floor(Math.abs(v)*p)/p},
INT:a=>Math.floor(num(a[0])),ABS:a=>Math.abs(num(a[0])),MOD:a=>num(a[0])%num(a[1]),
POWER:a=>num(a[0])**num(a[1]),LARGE:a=>arr(a[0]).map(num).sort((x,y)=>y-x)[num(a[1])-1]??"#NUM!",
SMALL:a=>arr(a[0]).map(num).sort((x,y)=>x-y)[num(a[1])-1]??"#NUM!",
XLOOKUP:a=>{const i=arr(a[1]).findIndex(v=>eq(v,a[0]));return i<0?a[3]??"#N/A":arr(a[2])[i]??""},
XMATCH:a=>{const i=arr(a[1]).findIndex(v=>eq(v,a[0]));return i<0?"#N/A":i+1},
MATCH:a=>{const i=arr(a[1]).findIndex(v=>eq(v,a[0]));return i<0?"#N/A":i+1},
VLOOKUP:a=>{let r=mat(a[1]).find(x=>eq(x[0],a[0]));return r?r[num(a[2])-1]??"#REF!":"#N/A"},
INDEX:a=>mat(a[0])[num(a[1])-1]?.[num(a[2]??1)-1]??"#REF!",
UNIQUE:a=>{const seen=new Set();return mat(a[0]).filter(r=>{const k=JSON.stringify(r);if(seen.has(k))return false;seen.add(k);return true})},
FILTER:a=>{const cond=arr(a[1]),res=mat(a[0]).filter((_,i)=>yes(cond[i]));return res.length?res:[[a[2]??""]]},
SORT:a=>mat(a[0]).slice().sort((x,y)=>{const u=x[num(a[1]??1)-1],v=y[num(a[1]??1)-1];return (Number.isFinite(+u)&&Number.isFinite(+v)?+u-(+v):str(u).localeCompare(str(v),"zh"))*(num(a[2]??1)===-1?-1:1)}),
SEQUENCE:a=>Array.from({length:Math.max(1,Math.min(1000,num(a[0])))},(_,i)=>Array.from({length:Math.max(1,Math.min(26,num(a[1]??1)))},(_,j)=>num(a[2]??1)+(i*Math.max(1,num(a[1]??1))+j)*num(a[3]??1))),
TRANSPOSE:a=>{const x=mat(a[0]);return Array.from({length:x[0]?.length||0},(_,c)=>x.map(r=>r[c]??""))},
ROWS:a=>mat(a[0]).length,COLUMNS:a=>mat(a[0])[0]?.length||0,
TEXT:a=>{let p=str(a[1]);return /^0+$/.test(p)?String(Math.trunc(num(a[0]))).padStart(p.length,"0"):p==="0.00"?num(a[0]).toFixed(2):str(a[0])},
VALUE:a=>num(a[0]),ISNUMBER:a=>typeof first(a[0])==="number",ISTEXT:a=>typeof first(a[0])==="string",ISBLANK:a=>first(a[0])==="",
CHOOSE:a=>a[num(a[0])]??"#VALUE!",
DATE:a=>new Date(Date.UTC(num(a[0]),num(a[1])-1,num(a[2]))).toISOString().slice(0,10),
YEAR:a=>new Date(str(a[0])).getUTCFullYear(),MONTH:a=>new Date(str(a[0])).getUTCMonth()+1,DAY:a=>new Date(str(a[0])).getUTCDate(),
TODAY:()=>new Date().toISOString().slice(0,10),
DAYS:a=>Math.round((Date.parse(str(a[0]))-Date.parse(str(a[1])))/86400000)
};
function evaluate(raw,getCell,sheet,stack={}){if(typeof raw!=="string"||!raw.startsWith("="))return raw;let ast;try{ast=parse(raw.slice(1))}catch(e){return e.message}
const visit=node=>{if(node.k==="v")return node.v;if(node.k==="ref"){const p=coordinate(node.ref);return getCell(node.sheet||sheet,p.r,p.c,stack)}if(node.k==="colrange"){const a=coordinate(node.a.replace(/\$/g,"")+"1"),b=coordinate(node.b.replace(/\$/g,"")+"1"),m=[];for(let row=0;row<20000;row++){const cells=[];for(let c=Math.min(a.c,b.c);c<=Math.max(a.c,b.c);c++)cells.push(getCell(node.sheet||sheet,row,c,stack));m.push(cells)}return{__matrix:true,data:m}}if(node.k==="range"){const a=coordinate(node.a),b=coordinate(node.b),m=[];for(let r=Math.min(a.r,b.r);r<=Math.max(a.r,b.r);r++){if(r>20000||m.length>20000)fail("#LIMIT!");let row=[];for(let c=Math.min(a.c,b.c);c<=Math.max(a.c,b.c);c++){if(c>100)fail("#LIMIT!");row.push(getCell(node.sheet||sheet,r,c,stack))}m.push(row)}return{__matrix:true,data:m}}
if(node.k==="u")return node.op==="-"?-num(visit(node.a)):num(visit(node.a));
if(node.k==="percent")return num(visit(node.a))/100;
if(node.k==="bin"){const a=visit(node.a),b=visit(node.b);if(["=","<>","<",">","<=",">="].includes(node.op)){if(a&&a.__matrix||b&&b.__matrix){const left=a&&a.__matrix?mat(a):null,right=b&&b.__matrix?mat(b):null;const rows=Math.max(left?.length||1,right?.length||1),cols=Math.max(left?.[0]?.length||1,right?.[0]?.length||1);return {__matrix:true,data:Array.from({length:rows},(_,r)=>Array.from({length:cols},(_,c)=>cmp(left?left[r]?.[c]??"":a,right?right[r]?.[c]??"":b,node.op)))}}return cmp(a,b,node.op)}if(node.op==="&")return str(a)+str(b);if(node.op==="+")return num(a)+num(b);if(node.op==="-")return num(a)-num(b);if(node.op==="*")return num(a)*num(b);if(node.op==="/")return num(b)?num(a)/num(b):fail("#DIV/0!");if(node.op==="^")return num(a)**num(b)}
if(node.k==="fn"){const n=node.name;if(n==="IF")return yes(visit(node.args[0]))?visit(node.args[1]):node.args[2]?visit(node.args[2]):false;if(n==="IFERROR"||n==="IFNA"){try{let z=visit(node.args[0]);return typeof z==="string"&&z.startsWith("#")?(node.args[1]?visit(node.args[1]):""):z}catch(e){return node.args[1]?visit(node.args[1]):""}}if(n==="IFS"){for(let i=0;i<node.args.length;i+=2)if(yes(visit(node.args[i])))return visit(node.args[i+1]);return"#N/A"}if(n==="AND"){for(let a of node.args)if(!yes(visit(a)))return false;return true}if(n==="OR"){for(let a of node.args)if(yes(visit(a)))return true;return false}
if(n==="ROW")return node.args[0]?.k==="ref"?coordinate(node.args[0].ref).r+1:(stack.currentRow||0)+1;if(n==="COLUMN")return node.args[0]?.k==="ref"?coordinate(node.args[0].ref).c+1:(stack.currentCol||0)+1;if(n==="INDIRECT"){const ref=str(visit(node.args[0]));if(ref.length>200)fail("#REF!");return visit(parse(ref))};
if(!functions[n])fail("#NAME? "+n);return functions[n](node.args.map(visit))}
fail("#ERROR!")};
try{return visit(ast)}catch(e){return e.message||"#ERROR!"}}
root.SheetFormula={evaluate,coordinate,functions:Object.keys(functions),parse,flatten:arr,matrix:mat};
})(typeof window==="undefined"?globalThis:window);