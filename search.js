let posts=[];
const result=document.getElementById('result');
const input=document.getElementById('q');

// feeday 发布系统后生成此文件即可
fetch('search.json')
.then(r=>r.json())
.then(d=>posts=d)
.catch(()=>result.innerHTML='<div class="card">等待 feeday 搜索索引生成</div>');

input.oninput=()=>{
 const q=input.value.toLowerCase();
 result.innerHTML='';
 if(!q)return;
 posts.filter(x=>JSON.stringify(x).toLowerCase().includes(q))
 .slice(0,20).forEach(x=>{
 result.innerHTML+=`<div class="card"><h3>${x.title}</h3><div class="tag">${x.date||''} ${x.category||''}</div><p>${x.desc||''}</p><a href="${x.url}" target="_blank">查看文章</a></div>`;
 });
};