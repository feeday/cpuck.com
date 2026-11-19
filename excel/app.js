(function(){
"use strict";
function launch(){if(!window.CPuck||!window.CPuckTools||!window.CPuckIO||!window.SheetFormula){document.getElementById("saveStatus").textContent="组件加载失败，请刷新页面";return}
try{window.CPuck.connect();window.CPuckTools.connect();window.CPuckIO.connect()}catch(e){document.getElementById("saveStatus").textContent="初始化失败："+(e.message||"错误");console.error("CPuck editor init",e)}}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",launch);else launch();
})();