(()=>{
'use strict';

const controller=window.zeroSiteController;
if(!controller)return;

const MAX_WINDOWS=10;
const windows=new Map();
let nextWindowId=1;
let topZ=12010;
let cascadeIndex=0;

const APP_ICONS={
terminal:'>_',
calculator:'＋',
paint:'✎',
notepad:'≡',
browser:'◎'
};

const SEARCH_ENGINES={
google:{label:'Google',action:'https://www.google.com/search',parameter:'q',icon:'assets/search-engines/google.svg'},
duckduckgo:{label:'DuckDuckGo',action:'https://duckduckgo.com/',parameter:'q',icon:'assets/search-engines/duckduckgo.svg'},
brave:{label:'Brave',action:'https://search.brave.com/search',parameter:'q',icon:'assets/search-engines/brave.svg'},
bing:{label:'Bing',action:'https://www.bing.com/search',parameter:'q',icon:'assets/search-engines/bing.svg'},
mojeek:{label:'Mojeek',action:'https://www.mojeek.com/search',parameter:'q',icon:'assets/search-engines/mojeek.svg'}
};

const layer=document.createElement('div');
layer.className='desktop-layer';
layer.id='desktopLayer';
layer.setAttribute('aria-live','polite');

const taskbar=document.createElement('div');
taskbar.className='desktop-taskbar';
taskbar.setAttribute('aria-label','開いているアプリ');
layer.appendChild(taskbar);
document.body.appendChild(layer);

let desktopTouchStart=null;
layer.addEventListener('touchstart',event=>{
if(!isMobileLayout())return;
const touch=event.changedTouches[0];
desktopTouchStart={x:touch.clientX,y:touch.clientY};
},{passive:true});
layer.addEventListener('touchend',event=>{
if(!desktopTouchStart||!isMobileLayout())return;
const touch=event.changedTouches[0];
const deltaX=touch.clientX-desktopTouchStart.x;
const deltaY=touch.clientY-desktopTouchStart.y;
desktopTouchStart=null;
if(Math.abs(deltaX)<60||Math.abs(deltaX)<Math.abs(deltaY))return;
if(deltaX>0)controller.openDeviceCard?.();
else controller.openNavigationCard?.();
},{passive:true});

function isMobileLayout(){return matchMedia('(max-width:640px)').matches;}

function updateDesktopState(){
const hasWindows=windows.size>0;
document.body.classList.toggle('desktop-app-active',hasWindows);
taskbar.classList.toggle('is-visible',hasWindows);
if(!hasWindows)taskbar.replaceChildren();
controller.refreshEdgeState?.();
}

function focusWindow(record){
if(!record||record.minimized)return;
topZ+=1;
record.element.style.zIndex=String(topZ);
windows.forEach(item=>item.element.classList.toggle('is-focused',item===record));
record.taskButton?.classList.add('is-active');
windows.forEach(item=>{
if(item!==record)item.taskButton?.classList.remove('is-active');
});
}

function syncTaskButton(record){
if(!record.taskButton)return;
record.taskButton.classList.toggle('is-minimized',record.minimized);
record.taskButton.setAttribute('aria-label',`${record.title}${record.minimized?'を復元':'へ切り替え'}`);
}

function toggleMinimize(record,force){
if(!record)return;
record.minimized=typeof force==='boolean'?force:!record.minimized;
record.element.classList.toggle('is-minimized',record.minimized);
record.element.setAttribute('aria-hidden',String(record.minimized));
syncTaskButton(record);
if(!record.minimized){
focusWindow(record);
requestAnimationFrame(()=>record.focusTarget?.focus());
}else{
const next=[...windows.values()].reverse().find(item=>item!==record&&!item.minimized);
if(next)focusWindow(next);
}
}

function toggleMaximize(record,force){
if(!record||isMobileLayout())return;
const maximize=typeof force==='boolean'?force:!record.maximized;
if(maximize===record.maximized)return;
if(maximize){
record.restoreRect={
left:record.element.style.left,
top:record.element.style.top,
width:record.element.style.width,
height:record.element.style.height
};
record.element.classList.add('is-maximized');
}else{
record.element.classList.remove('is-maximized');
if(record.restoreRect)Object.assign(record.element.style,record.restoreRect);
}
record.maximized=maximize;
record.maximizeButton.setAttribute('aria-label',maximize?'元のサイズに戻す':'最大化');
focusWindow(record);
}

function closeWindow(record){
if(!record||!windows.has(record.id))return;
record.dispose?.();
record.element.classList.add('is-closing');
record.taskButton?.remove();
windows.delete(record.id);
setTimeout(()=>record.element.remove(),180);
const next=[...windows.values()].reverse().find(item=>!item.minimized);
if(next)focusWindow(next);
updateDesktopState();
}

function createTaskButton(record){
const button=document.createElement('button');
button.type='button';
button.className='desktop-task-item';
button.innerHTML='<span aria-hidden="true"></span><b></b>';
button.querySelector('span').textContent=record.icon;
button.querySelector('b').textContent=`${record.title} ${record.id}`;
button.addEventListener('click',()=>{
if(record.minimized)toggleMinimize(record,false);
else focusWindow(record);
});
taskbar.appendChild(button);
record.taskButton=button;
syncTaskButton(record);
}

function clampWindow(record){
if(isMobileLayout()||record.maximized)return;
const rect=record.element.getBoundingClientRect();
const width=Math.min(rect.width,window.innerWidth-16);
const height=Math.min(rect.height,window.innerHeight-56);
if(width!==rect.width)record.element.style.width=`${width}px`;
if(height!==rect.height)record.element.style.height=`${height}px`;
const maxLeft=Math.max(8,window.innerWidth-Math.min(width,window.innerWidth)-8);
const maxTop=Math.max(8,window.innerHeight-Math.min(height,window.innerHeight)-44);
record.element.style.left=`${Math.min(Math.max(8,rect.left),maxLeft)}px`;
record.element.style.top=`${Math.min(Math.max(8,rect.top),maxTop)}px`;
}

function installWindowDrag(record,titlebar){
let drag=null;
titlebar.addEventListener('pointerdown',event=>{
if(event.button!==0||event.target.closest('button')||record.maximized||isMobileLayout())return;
const rect=record.element.getBoundingClientRect();
drag={pointerId:event.pointerId,x:event.clientX,y:event.clientY,left:rect.left,top:rect.top};
titlebar.setPointerCapture(event.pointerId);
titlebar.classList.add('is-dragging');
focusWindow(record);
event.preventDefault();
});
titlebar.addEventListener('pointermove',event=>{
if(!drag||event.pointerId!==drag.pointerId)return;
const left=drag.left+event.clientX-drag.x;
const top=drag.top+event.clientY-drag.y;
record.element.style.left=`${Math.min(Math.max(8,left),Math.max(8,window.innerWidth-record.element.offsetWidth-8))}px`;
record.element.style.top=`${Math.min(Math.max(8,top),Math.max(8,window.innerHeight-48))}px`;
});
const finishDrag=event=>{
if(!drag||event.pointerId!==drag.pointerId)return;
titlebar.classList.remove('is-dragging');
if(event.clientY<=6&&document.documentElement.dataset.windowSystem==='windows')toggleMaximize(record,true);
drag=null;
};
titlebar.addEventListener('pointerup',finishDrag);
titlebar.addEventListener('pointercancel',finishDrag);
titlebar.addEventListener('dblclick',event=>{
if(!event.target.closest('button'))toggleMaximize(record);
});
}

function createWindow({title='アプリ',appId='app',icon=APP_ICONS[appId]||'◆',width=760,height=480,build}){
if(windows.size>=MAX_WINDOWS){
controller.showToast(`同時に開けるウィンドウは${MAX_WINDOWS}個までです`);
return null;
}
controller.closeEdgeCards();

const id=nextWindowId++;
const element=document.createElement('section');
element.className='app-window';
element.dataset.app=appId;
element.dataset.windowId=String(id);
element.setAttribute('role','dialog');
element.setAttribute('aria-label',title);

const safeWidth=Math.min(width,window.innerWidth-32);
const safeHeight=Math.min(height,window.innerHeight-52);
const offset=(cascadeIndex++%6)*24;
element.style.width=`${safeWidth}px`;
element.style.height=`${safeHeight}px`;
element.style.left=`${Math.max(16,(window.innerWidth-safeWidth)/2+offset-60)}px`;
element.style.top=`${Math.max(16,(window.innerHeight-safeHeight)/2+offset-30)}px`;

const titlebar=document.createElement('header');
titlebar.className='app-window-titlebar';
titlebar.innerHTML=`
<div class="app-window-identity"><span class="app-window-icon" aria-hidden="true">&gt;_</span><strong></strong></div>
<div class="app-window-controls">
<button type="button" data-window-action="minimize" aria-label="最小化"><span aria-hidden="true">—</span></button>
<button type="button" data-window-action="maximize" aria-label="最大化"><span aria-hidden="true">□</span></button>
<button type="button" data-window-action="close" aria-label="閉じる"><span aria-hidden="true">×</span></button>
</div>`;
titlebar.querySelector('strong').textContent=title;
titlebar.querySelector('.app-window-icon').textContent=icon;

const content=document.createElement('div');
content.className='app-window-content';
element.append(titlebar,content);
layer.appendChild(element);

const record={id,title,appId,icon,element,content,minimized:false,maximized:false,restoreRect:null,taskButton:null,focusTarget:null,dispose:null,maximizeButton:titlebar.querySelector('[data-window-action="maximize"]')};
windows.set(id,record);
createTaskButton(record);
installWindowDrag(record,titlebar);

titlebar.querySelector('[data-window-action="minimize"]').addEventListener('click',()=>toggleMinimize(record));
record.maximizeButton.addEventListener('click',()=>toggleMaximize(record));
titlebar.querySelector('[data-window-action="close"]').addEventListener('click',()=>closeWindow(record));
element.addEventListener('pointerdown',()=>focusWindow(record));

const appApi={
record,
close:()=>closeWindow(record),
minimize:()=>toggleMinimize(record,true),
maximize:()=>toggleMaximize(record,true),
restore:()=>{toggleMinimize(record,false);toggleMaximize(record,false);},
openTerminal:()=>openTerminal(),
openCalculator:()=>openCalculator(),
openPaint:()=>openPaint(),
openNotepad:()=>openNotepad(),
openBrowser:()=>openBrowser()
};
const appResult=build?.(content,appApi)||{};
record.focusTarget=appResult.focusTarget||null;
record.dispose=appResult.dispose||null;
focusWindow(record);
updateDesktopState();
requestAnimationFrame(()=>record.focusTarget?.focus());
return record;
}

function tokenize(command){
const tokens=[];
command.replace(/"([^"]*)"|'([^']*)'|([^\s]+)/g,(_,doubleQuoted,singleQuoted,bare)=>{
tokens.push(doubleQuoted??singleQuoted??bare);
return'';
});
return tokens;
}

function normalizeTheme(value){
const aliases={
default:'style-default',material:'style-material',google:'style-material',
liquid:'style-liquidglass',liquidglass:'style-liquidglass',apple:'style-liquidglass',
fluent:'style-fluent',microsoft:'style-fluent',vrchat:'style-vrchat',vrc:'style-vrchat',
unity:'style-unity'
};
const key=String(value||'').toLowerCase().replace(/[\s_-]/g,'');
return aliases[key]||controller.styles.find(style=>style.id===value)?.id||null;
}

const destinations={
home:{label:'トップページ',url:'/'},
links:{label:'リンク一覧',url:'/links.html'},
article:{label:'note記事',url:'/blog/n8d41d4a76214.html'},
blog:{label:'ブログ一覧（準備中）',url:'/blog-list/'},
assets:{label:'VRChatアセット（準備中）',url:'/vrchat-assets/'},
note:{label:'note',url:'https://note.com/zerrrrro_1288'},
x:{label:'X',url:'https://x.com/ZErrrrrO_VRC'},
youtube:{label:'YouTube',url:'https://www.youtube.com/@ZErrrrrO_VRC'},
booth:{label:'BOOTH',url:'https://zerrrrro.booth.pm/'},
github:{label:'GitHub',url:'https://github.com/SuperZero1288'}
};

function getPrompt(){
return document.documentElement.dataset.windowSystem==='macos'?'zero@portfolio ~ %':'C:\\ZERO>';
}

function openTerminal(){
return createWindow({
title:'Terminal',
appId:'terminal',
width:780,
height:500,
build:(content,app)=>buildTerminal(content,app)
});
}

function downloadBlob(blob,filename){
const url=URL.createObjectURL(blob);
const anchor=document.createElement('a');
anchor.href=url;
anchor.download=filename;
document.body.appendChild(anchor);
anchor.click();
anchor.remove();
setTimeout(()=>URL.revokeObjectURL(url),1500);
}

function localDateStamp(includeTime=false){
const now=new Date();
const date=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
if(!includeTime)return date;
return `${date}-${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${String(now.getSeconds()).padStart(2,'0')}`;
}

function calculateExpression(raw){
const source=String(raw).replace(/[×＊]/g,'*').replace(/[÷／]/g,'/').replace(/[−ー]/g,'-').replace(/％/g,'%').replace(/\s+/g,'');
let index=0;
const peek=()=>source[index];
const consume=value=>source.startsWith(value,index)?(index+=value.length,true):false;
const number=()=>{
const match=source.slice(index).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i);
if(!match)throw new Error('数式を確認してください');
index+=match[0].length;
return Number(match[0]);
};
const primary=()=>{
if(consume('√')){
const value=primary();
if(value<0)throw new Error('負の数の平方根は計算できません');
return Math.sqrt(value);
}
if(consume('(')){
const value=expression();
if(!consume(')'))throw new Error('かっこが閉じられていません');
return value;
}
return number();
};
const postfix=()=>{
let value=primary();
while(consume('%'))value/=100;
return value;
};
const unary=()=>{
if(consume('+'))return unary();
if(consume('-'))return-unary();
return postfix();
};
const power=()=>{
const left=unary();
return consume('^')?Math.pow(left,power()):left;
};
const product=()=>{
let value=power();
while(peek()==='*'||peek()==='/'){
const operator=source[index++];
const right=power();
if(operator==='/'&&right===0)throw new Error('0では割れません');
value=operator==='*'?value*right:value/right;
}
return value;
};
const expression=()=>{
let value=product();
while(peek()==='+'||peek()==='-'){
const operator=source[index++];
const right=product();
value=operator==='+'?value+right:value-right;
}
return value;
};
if(!source)throw new Error('数式を入力してください');
const result=expression();
if(index!==source.length||!Number.isFinite(result))throw new Error('数式を確認してください');
return result;
}

function formatCalculatorValue(value){
if(Number.isInteger(value))return String(value);
return Number(value.toPrecision(12)).toString();
}

function openCalculator(){
return createWindow({
title:'電卓',
appId:'calculator',
width:390,
height:590,
build:(content)=>buildCalculator(content)
});
}

function buildCalculator(content){
content.classList.add('calculator-app');
content.innerHTML=`
<div class="calculator-display">
<label for="calculatorInput-${nextWindowId}">計算式</label>
<input id="calculatorInput-${nextWindowId}" type="text" inputmode="decimal" value="0" autocomplete="off" spellcheck="false" aria-label="計算式">
<output aria-live="polite">&nbsp;</output>
</div>
<div class="calculator-keys" aria-label="電卓のキー">
<button type="button" data-calc-action="clear" class="is-utility">C</button>
<button type="button" data-calc-action="backspace" class="is-utility" aria-label="一文字削除">⌫</button>
<button type="button" data-calc-value="(" class="is-utility">(</button>
<button type="button" data-calc-value=")" class="is-utility">)</button>
<button type="button" data-calc-value="7">7</button><button type="button" data-calc-value="8">8</button><button type="button" data-calc-value="9">9</button><button type="button" data-calc-value="÷" class="is-operator">÷</button>
<button type="button" data-calc-value="4">4</button><button type="button" data-calc-value="5">5</button><button type="button" data-calc-value="6">6</button><button type="button" data-calc-value="×" class="is-operator">×</button>
<button type="button" data-calc-value="1">1</button><button type="button" data-calc-value="2">2</button><button type="button" data-calc-value="3">3</button><button type="button" data-calc-value="−" class="is-operator">−</button>
<button type="button" data-calc-action="sign">±</button><button type="button" data-calc-value="0">0</button><button type="button" data-calc-value=".">.</button><button type="button" data-calc-value="+" class="is-operator">＋</button>
<button type="button" data-calc-action="sqrt">√</button><button type="button" data-calc-value="%">%</button><button type="button" data-calc-value="^">xʸ</button><button type="button" data-calc-action="equals" class="is-equals">＝</button>
</div>`;
const input=content.querySelector('input');
const output=content.querySelector('output');
let justCalculated=false;
const clear=()=>{input.value='0';output.innerHTML='&nbsp;';justCalculated=false;};
const calculate=()=>{
try{
const expression=input.value;
const result=formatCalculatorValue(calculateExpression(expression));
output.textContent=`${expression} =`;
input.value=result;
justCalculated=true;
}catch(error){output.textContent=error.message;output.classList.add('is-error');return;}
output.classList.remove('is-error');
};
const append=value=>{
output.classList.remove('is-error');
const isOperator=/^[+×÷−%^)]$/.test(value);
if((input.value==='0'||justCalculated)&&!isOperator)input.value='';
if(justCalculated&&!isOperator)output.innerHTML='&nbsp;';
input.value+=value;
justCalculated=false;
input.focus();
};
content.querySelector('.calculator-keys').addEventListener('click',event=>{
const button=event.target.closest('button');
if(!button)return;
const action=button.dataset.calcAction;
if(action==='clear')clear();
else if(action==='backspace'){input.value=input.value.length>1?input.value.slice(0,-1):'0';justCalculated=false;}
else if(action==='equals')calculate();
else if(action==='sign'){
if(/^[-+]?\d*\.?\d+$/.test(input.value))input.value=String(-Number(input.value));
else append('−');
}else if(action==='sqrt'){
input.value=input.value==='0'?'√(':`√(${input.value})`;
justCalculated=false;
}else append(button.dataset.calcValue||'');
});
input.addEventListener('input',()=>{
input.value=input.value.replace(/[^0-9eE.+\-−×*÷/%％^()√\s]/g,'');
justCalculated=false;
});
input.addEventListener('keydown',event=>{
if(event.key==='Enter'){event.preventDefault();calculate();}
if(event.key==='Escape'){event.preventDefault();clear();}
});
input.addEventListener('focus',()=>input.select());
return{focusTarget:input};
}

function openPaint(){
return createWindow({
title:'ペイント',
appId:'paint',
width:900,
height:610,
build:(content)=>buildPaint(content)
});
}

function buildPaint(content){
content.classList.add('paint-app');
content.innerHTML=`
<div class="paint-toolbar">
<label class="paint-color">色<input type="color" value="#17181d" aria-label="描画色"></label>
<label class="paint-size">太さ<input type="range" min="1" max="60" value="8" aria-label="線の太さ"><output>8</output></label>
<button type="button" data-paint-action="eraser" aria-pressed="false">消しゴム</button>
<button type="button" data-paint-action="undo" disabled>元に戻す</button>
<button type="button" data-paint-action="clear">新規</button>
<button type="button" data-paint-action="download" class="is-primary">PNGで保存</button>
</div>
<div class="paint-stage"><canvas width="1600" height="900" tabindex="0" aria-label="描画キャンバス"></canvas></div>`;
const canvas=content.querySelector('canvas');
const context=canvas.getContext('2d',{willReadFrequently:true});
const color=content.querySelector('input[type="color"]');
const size=content.querySelector('input[type="range"]');
const sizeOutput=content.querySelector('.paint-size output');
const eraserButton=content.querySelector('[data-paint-action="eraser"]');
const undoButton=content.querySelector('[data-paint-action="undo"]');
let drawing=false;
let erasing=false;
let lastPoint=null;
const undoStack=[];
const paintWhite=()=>{context.save();context.fillStyle='#ffffff';context.fillRect(0,0,canvas.width,canvas.height);context.restore();};
const snapshot=()=>{
try{undoStack.push(context.getImageData(0,0,canvas.width,canvas.height));if(undoStack.length>10)undoStack.shift();undoButton.disabled=false;}catch{}
};
const pointFromEvent=event=>{
const rect=canvas.getBoundingClientRect();
return{x:(event.clientX-rect.left)*canvas.width/rect.width,y:(event.clientY-rect.top)*canvas.height/rect.height};
};
const startDrawing=event=>{
if(event.button!==undefined&&event.button!==0)return;
snapshot();
drawing=true;
lastPoint=pointFromEvent(event);
canvas.setPointerCapture?.(event.pointerId);
event.preventDefault();
};
const draw=event=>{
if(!drawing)return;
const point=pointFromEvent(event);
context.save();
context.strokeStyle=erasing?'#ffffff':color.value;
context.lineWidth=Number(size.value);
context.lineCap='round';
context.lineJoin='round';
context.beginPath();
context.moveTo(lastPoint.x,lastPoint.y);
context.lineTo(point.x,point.y);
context.stroke();
context.restore();
lastPoint=point;
event.preventDefault();
};
const stopDrawing=event=>{if(!drawing)return;draw(event);drawing=false;lastPoint=null;};
paintWhite();
canvas.addEventListener('pointerdown',startDrawing);
canvas.addEventListener('pointermove',draw);
canvas.addEventListener('pointerup',stopDrawing);
canvas.addEventListener('pointercancel',()=>{drawing=false;lastPoint=null;});
size.addEventListener('input',()=>{sizeOutput.textContent=size.value;});
eraserButton.addEventListener('click',()=>{
erasing=!erasing;
eraserButton.setAttribute('aria-pressed',String(erasing));
eraserButton.classList.toggle('is-active',erasing);
canvas.classList.toggle('is-erasing',erasing);
});
undoButton.addEventListener('click',()=>{
const state=undoStack.pop();
if(state)context.putImageData(state,0,0);
undoButton.disabled=undoStack.length===0;
});
content.querySelector('[data-paint-action="clear"]').addEventListener('click',()=>{snapshot();paintWhite();});
content.querySelector('[data-paint-action="download"]').addEventListener('click',()=>{
canvas.toBlob(blob=>{
if(!blob){controller.showToast('PNGを作成できませんでした');return;}
downloadBlob(blob,`zero-paint-${localDateStamp(true)}.png`);
controller.showToast('PNGを保存しました');
},'image/png');
});
return{focusTarget:canvas};
}

function openNotepad(){
return createWindow({
title:'メモ帳',
appId:'notepad',
width:720,
height:540,
build:(content)=>buildNotepad(content)
});
}

function buildNotepad(content){
content.classList.add('notepad-app');
content.innerHTML=`
<div class="notepad-toolbar">
<label>ファイル名<input type="text" value="memo-${localDateStamp()}.txt" aria-label="ファイル名"></label>
<button type="button">TXTで保存</button>
</div>
<textarea aria-label="メモ本文" placeholder="ここにメモを書けます。内容はこのブラウザにも自動保存されます。" spellcheck="true"></textarea>
<div class="notepad-status"><span>自動保存</span><output>0文字 / 1行</output></div>`;
const filename=content.querySelector('input');
const textarea=content.querySelector('textarea');
const saveButton=content.querySelector('button');
const status=content.querySelector('.notepad-status output');
let saveTimer=0;
try{textarea.value=localStorage.getItem('zero-notepad-document')||'';}catch{}
const updateStatus=()=>{
const lines=textarea.value?textarea.value.split(/\r?\n/).length:1;
status.textContent=`${textarea.value.length}文字 / ${lines}行`;
};
const persist=()=>{try{localStorage.setItem('zero-notepad-document',textarea.value);}catch{}};
const download=()=>{
let name=filename.value.trim().replace(/[\\/:*?"<>|]/g,'_')||`memo-${localDateStamp()}.txt`;
if(!name.toLowerCase().endsWith('.txt'))name+='.txt';
downloadBlob(new Blob([textarea.value],{type:'text/plain;charset=utf-8'}),name);
persist();
controller.showToast('テキストを保存しました');
};
textarea.addEventListener('input',()=>{
updateStatus();
clearTimeout(saveTimer);
saveTimer=setTimeout(persist,350);
});
textarea.addEventListener('keydown',event=>{
if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){
event.preventDefault();
download();
}
});
saveButton.addEventListener('click',download);
updateStatus();
return{focusTarget:textarea,dispose:()=>{clearTimeout(saveTimer);persist();}};
}

function openBrowser(){
return createWindow({
title:'ウェブ ブラウザ',
appId:'browser',
width:820,
height:540,
build:(content)=>buildBrowser(content)
});
}

function buildBrowser(content){
content.classList.add('browser-app');
content.innerHTML=`
<form class="browser-toolbar" role="search" action="https://www.google.com/search" method="get" target="_blank" rel="noopener noreferrer">
<div class="browser-search-options">
<label>検索エンジン<select name="engine" aria-label="検索エンジン"><option value="google">Google</option><option value="duckduckgo">DuckDuckGo</option><option value="brave">Brave</option><option value="bing">Bing</option><option value="mojeek">Mojeek</option></select></label>
<label>開き方<select name="openMode" aria-label="検索結果の開き方"><option value="new">新しいタブ</option><option value="current">このタブを上書き</option></select></label>
</div>
<div class="browser-search-row">
<span aria-hidden="true">⌕</span>
<input type="search" name="q" placeholder="ウェブを検索" aria-label="ウェブを検索" autocomplete="off">
<button type="submit">検索</button>
</div>
</form>
<div class="browser-start">
<div class="browser-mark" aria-hidden="true"><img src="assets/search-engines/google.svg" alt=""></div>
<h2>ウェブを検索</h2>
<p class="browser-mode-note">Googleの検索結果を新しいタブで開きます。</p>
<section class="browser-recent" aria-labelledby="browser-recent-title"><h3 id="browser-recent-title">最近の検索</h3><div></div></section>
</div>`;
const form=content.querySelector('form');
const input=content.querySelector('input[type="search"]');
const engineSelect=content.querySelector('[name="engine"]');
const openModeSelect=content.querySelector('[name="openMode"]');
const browserMark=content.querySelector('.browser-mark');
const browserMarkImage=browserMark.querySelector('img');
const modeNote=content.querySelector('.browser-mode-note');
const recentList=content.querySelector('.browser-recent div');
let recent=[];
try{recent=JSON.parse(localStorage.getItem('zero-browser-recent')||'[]');if(!Array.isArray(recent))recent=[];}catch{recent=[];}
try{
const settings=JSON.parse(localStorage.getItem('zero-browser-settings')||'{}');
if(SEARCH_ENGINES[settings.engine])engineSelect.value=settings.engine;
if(settings.openMode==='new'||settings.openMode==='current')openModeSelect.value=settings.openMode;
}catch{}
const selectedEngine=()=>SEARCH_ENGINES[engineSelect.value]||SEARCH_ENGINES.google;
const saveSettings=()=>{
try{localStorage.setItem('zero-browser-settings',JSON.stringify({engine:engineSelect.value,openMode:openModeSelect.value}));}catch{}
};
const updateSearchUi=()=>{
const engine=selectedEngine();
browserMark.dataset.engine=engineSelect.value;
browserMarkImage.src=engine.icon;
input.placeholder=`${engine.label}で検索`;
input.setAttribute('aria-label',`${engine.label}で検索`);
modeNote.textContent=openModeSelect.value==='current'
?`${engine.label}の検索結果でこのタブを上書きします。`
:`${engine.label}の検索結果を新しいタブで開きます。`;
saveSettings();
};
const openSearch=query=>{
const engine=selectedEngine();
const searchForm=document.createElement('form');
searchForm.action=engine.action;
searchForm.method='get';
searchForm.target=openModeSelect.value==='current'?'_self':'_blank';
searchForm.rel='noopener noreferrer';
searchForm.hidden=true;
const queryInput=document.createElement('input');
queryInput.name=engine.parameter;
queryInput.value=query;
searchForm.appendChild(queryInput);
document.body.appendChild(searchForm);
searchForm.submit();
searchForm.remove();
};
const renderRecent=()=>{
recentList.replaceChildren();
if(!recent.length){const empty=document.createElement('p');empty.textContent='まだ検索履歴はありません';recentList.appendChild(empty);return;}
recent.slice(0,6).forEach(query=>{
const button=document.createElement('button');
button.type='button';
button.textContent=query;
button.addEventListener('click',()=>{input.value=query;openSearch(query);});
recentList.appendChild(button);
});
};
form.addEventListener('submit',event=>{
event.preventDefault();
const query=input.value.trim();
if(!query)return;
recent=[query,...recent.filter(item=>item!==query)].slice(0,6);
try{localStorage.setItem('zero-browser-recent',JSON.stringify(recent));}catch{}
renderRecent();
openSearch(query);
});
engineSelect.addEventListener('change',updateSearchUi);
openModeSelect.addEventListener('change',updateSearchUi);
updateSearchUi();
renderRecent();
return{focusTarget:input};
}

function buildTerminal(content,app){
content.classList.add('terminal-app');
const output=document.createElement('div');
output.className='terminal-output';
output.setAttribute('role','log');
output.setAttribute('aria-live','polite');

const form=document.createElement('form');
form.className='terminal-command-line';
form.innerHTML='<label class="terminal-prompt"></label><input type="text" aria-label="コマンド" autocomplete="off" autocapitalize="none" spellcheck="false">';
const prompt=form.querySelector('.terminal-prompt');
const input=form.querySelector('input');
content.append(output,form);

let history=[];
let historyIndex=0;
let disposed=false;

const updatePrompt=()=>{prompt.textContent=getPrompt();};
const write=(text='',kind='normal')=>{
const line=document.createElement('div');
line.className=`terminal-line terminal-${kind}`;
line.textContent=String(text);
output.appendChild(line);
output.scrollTop=output.scrollHeight;
};
const writeCommand=command=>{
const line=document.createElement('div');
line.className='terminal-line terminal-entered-command';
const prefix=document.createElement('span');
prefix.textContent=`${getPrompt()} `;
const value=document.createElement('b');
value.textContent=command;
line.append(prefix,value);
output.appendChild(line);
};
const writeDevice=()=>{
const state=controller.getDeviceState();
const appearance=controller.getAppearance();
write(`OS              ${state.effectiveOs}${state.hacked?'  [ハック済み]':''}`,'accent');
write(`実際のOS        ${state.actualOs}`);
write(`ブラウザ        ${state.browser}`);
write(`ウィンドウUI    ${state.windowSystem==='macos'?'macOS':'Windows'}`);
write(`テーマ          ${appearance.name} / ${appearance.light?'Light':'Dark'}`);
write(`画面            ${screen.width} x ${screen.height}`);
write(`表示領域        ${window.innerWidth} x ${window.innerHeight}`);
write(`CPU             ${navigator.hardwareConcurrency?`${navigator.hardwareConcurrency} 論理コア`:'取得できません'}`);
write(`言語            ${navigator.language||'不明'}`);
};
const runHackTransition=(label,action,onComplete)=>{
const finish=result=>{
if(disposed)return;
onComplete(result);
requestAnimationFrame(()=>input.focus());
};
const fail=error=>{
if(disposed)return;
write(`変更に失敗しました: ${error?.message||'不明なエラー'}`,'error');
};
if(window.zeroSiteLoader?.playTransition){
window.zeroSiteLoader.playTransition(label,action).then(finish).catch(fail);
}else{
try{finish(action());}catch(error){fail(error);}
}
};

const execute=raw=>{
const tokens=tokenize(raw.trim());
if(!tokens.length)return;
const command=tokens.shift().toLowerCase();
const sub=(tokens[0]||'').toLowerCase();

switch(command){
case'help':case'?':
write('利用できるコマンド','accent');
write('  help                         コマンド一覧');
write('  device                       この端末について');
write('  theme [list|next|set NAME]   サイトテーマ');
write('  mode [dark|light|toggle]      明暗モード');
write('  clock [12|24]                 時計の表示形式');
write('  hack os [macos|windows|linux|auto]');
write('                               OS表示とウィンドウUIを上書き');
write('  open [list|DESTINATION]       サイト内外のページを開く');
write('  calc / paint / notepad / browser  アプリを開く');
write('  new                          ターミナルをもう1つ開く');
write('  windows                      開いているウィンドウ');
write('  window [focus|close] ID       ウィンドウ操作');
write('  minimize / maximize / close   このウィンドウを操作');
write('  date / whoami / ver / echo    基本コマンド');
write('  settings / history / clear    設定・履歴・画面消去');
break;
case'clear':case'cls':output.replaceChildren();break;
case'ver':write('ZERO SITE TERMINAL 1.0.0');break;
case'whoami':write('visitor@zero-site');break;
case'date':write(new Intl.DateTimeFormat('ja-JP',{dateStyle:'full',timeStyle:'medium'}).format(new Date()));break;
case'echo':write(tokens.join(' '));break;
case'device':case'system':case'info':case'neofetch':writeDevice();break;
case'theme':{
if(!sub){
const appearance=controller.getAppearance();
write(`${appearance.name} (${appearance.style}) / ${appearance.light?'Light':'Dark'}`,'accent');
break;
}
if(sub==='list'){
controller.styles.forEach(style=>write(`${style.id.replace('style-','').padEnd(14)} ${style.name}${style.light?'':'  [Darkのみ]'}`));
break;
}
if(sub==='next'){
const state=controller.getAppearance();
const index=controller.styles.findIndex(style=>style.id===state.style);
const next=controller.styles[(index+1)%controller.styles.length];
controller.setStyle(next.id);
write(`テーマを ${next.name} に変更しました`,'success');
break;
}
const requested=sub==='set'?tokens[1]:tokens[0];
const themeId=normalizeTheme(requested);
if(!themeId){write(`テーマが見つかりません: ${requested||''}`,'error');break;}
controller.setStyle(themeId);
write(`テーマを ${controller.getAppearance().name} に変更しました`,'success');
break;
}
case'mode':{
if(!sub){write(controller.getAppearance().light?'light':'dark','accent');break;}
if(!['dark','light','toggle'].includes(sub)){write('使い方: mode dark | light | toggle','error');break;}
if(controller.setColorMode(sub))write(`${controller.getAppearance().light?'ライト':'ダーク'}モードに変更しました`,'success');
else write('現在のテーマではライトモードを使用できません','error');
break;
}
case'clock':{
if(!sub){write(`${controller.getClockMode()}時間表示`,'accent');break;}
if(!controller.setClockMode(sub)){write('使い方: clock 12 | 24','error');break;}
write(`時計を${sub}時間表示に変更しました`,'success');
break;
}
case'settings':{
const appearance=controller.getAppearance();
const device=controller.getDeviceState();
write(`テーマ       ${appearance.name}`,'accent');
write(`モード       ${appearance.light?'Light':'Dark'}`);
write(`時計         ${controller.getClockMode()}時間表示`);
write(`OS表示       ${device.effectiveOs}${device.hacked?' [ハック済み]':' [自動]'}`);
write(`ウィンドウUI ${device.windowSystem==='macos'?'macOS':'Windows'}`);
break;
}
case'hack':{
if(!sub||sub==='status'){
const state=controller.getDeviceState();
write(`実際のOS: ${state.actualOs}`);
write(`表示中: ${state.effectiveOs}${state.hacked?' [ハック済み]':' [自動]'}`,'accent');
break;
}
if(sub==='reset'){
runHackTransition('OS情報を復元しています',()=>controller.setDeviceOsHack('auto'),()=>{
write('OS表示を自動判定に戻しました','success');
});
break;
}
if(sub!=='os'){write('使い方: hack os macos | windows | linux | auto','error');break;}
const value=String(tokens[1]||'').toLowerCase();
const aliases={mac:'macos',osx:'macos',win:'windows',ubuntu:'linux',reset:'auto'};
const os=aliases[value]||value;
if(!['macos','windows','linux','auto'].includes(os)){write('指定できるOS: macos, windows, linux, auto','error');break;}
runHackTransition('ウィンドウ環境を書き換えています',()=>controller.setDeviceOsHack(os),()=>{
const state=controller.getDeviceState();
write(os==='auto'?`自動判定に戻しました: ${state.effectiveOs}`:`OS表示を ${state.effectiveOs} に上書きしました [ハック済み]`,'success');
});
break;
}
case'open':{
if(!sub||sub==='list'){
Object.entries(destinations).forEach(([key,item])=>write(`${key.padEnd(10)} ${item.label}`));
write('terminal   新しいターミナル');
write('calculator 電卓');
write('paint      ペイント');
write('notepad    メモ帳');
write('browser    ウェブ ブラウザ');
break;
}
if(sub==='terminal'){openTerminal();write('新しいターミナルを開きました','success');break;}
if(sub==='calculator'||sub==='calc'){openCalculator();write('電卓を開きました','success');break;}
if(sub==='paint'){openPaint();write('ペイントを開きました','success');break;}
if(sub==='notepad'||sub==='memo'){openNotepad();write('メモ帳を開きました','success');break;}
if(sub==='browser'||sub==='web'){openBrowser();write('ウェブ ブラウザを開きました','success');break;}
const destination=destinations[sub];
if(!destination){write(`開く場所が見つかりません: ${sub}`,'error');break;}
const anchor=document.createElement('a');
anchor.href=destination.url;
anchor.target='_blank';
anchor.rel='noopener';
anchor.click();
write(`${destination.label}を新しいタブで開きました`,'success');
break;
}
case'new':case'terminal':openTerminal();write('新しいターミナルを開きました','success');break;
case'calc':case'calculator':openCalculator();write('電卓を開きました','success');break;
case'paint':openPaint();write('ペイントを開きました','success');break;
case'memo':case'notepad':openNotepad();write('メモ帳を開きました','success');break;
case'web':case'browser':openBrowser();write('ウェブ ブラウザを開きました','success');break;
case'windows':
windows.forEach(item=>write(`${String(item.id).padStart(2,'0')}  ${item.title.padEnd(12)} ${item.minimized?'[最小化]':item.maximized?'[最大化]':'[表示中]'}`,item===app.record?'accent':'normal'));
break;
case'window':{
const action=sub;
const id=Number(tokens[1]);
const target=windows.get(id);
if(!['focus','close','minimize','maximize'].includes(action)||!target){write('使い方: window focus | close | minimize | maximize ID','error');break;}
if(action==='focus'){toggleMinimize(target,false);focusWindow(target);}
if(action==='close')closeWindow(target);
if(action==='minimize')toggleMinimize(target,true);
if(action==='maximize'){toggleMinimize(target,false);toggleMaximize(target,true);}
write(`ウィンドウ ${id} を操作しました`,'success');
break;
}
case'minimize':app.minimize();break;
case'maximize':app.maximize();break;
case'close':case'exit':app.close();break;
case'history':history.forEach((item,index)=>write(`${String(index+1).padStart(3,' ')}  ${item}`));break;
default:write(`'${command}' はサイトコマンドとして認識されていません。help で一覧を表示できます。`,'error');
}
};

form.addEventListener('submit',event=>{
event.preventDefault();
const command=input.value.trim();
if(!command)return;
writeCommand(command);
history.push(command);
history=history.slice(-80);
historyIndex=history.length;
input.value='';
execute(command);
output.scrollTop=output.scrollHeight;
});

input.addEventListener('keydown',event=>{
if(event.key==='ArrowUp'&&history.length){
event.preventDefault();
historyIndex=Math.max(0,historyIndex-1);
input.value=history[historyIndex]||'';
requestAnimationFrame(()=>input.setSelectionRange(input.value.length,input.value.length));
}else if(event.key==='ArrowDown'&&history.length){
event.preventDefault();
historyIndex=Math.min(history.length,historyIndex+1);
input.value=history[historyIndex]||'';
}else if(event.key==='l'&&event.ctrlKey){
event.preventDefault();
output.replaceChildren();
}else if(event.key==='Tab'){
event.preventDefault();
const commands=['help','device','theme','mode','clock','settings','hack','open','new','calculator','paint','notepad','browser','windows','window','minimize','maximize','close','date','whoami','ver','history','clear'];
const matches=commands.filter(item=>item.startsWith(input.value.toLowerCase()));
if(matches.length===1)input.value=`${matches[0]} `;
else if(matches.length>1)write(matches.join('  '));
}
});

content.addEventListener('pointerdown',event=>{
if(!event.target.closest('button'))requestAnimationFrame(()=>input.focus());
});

const onHackChange=()=>updatePrompt();
window.addEventListener('zero:devicehackchange',onHackChange);
updatePrompt();
write('ZERO SITE TERMINAL [Version 1.0.0]','accent');
write('Copyright (c) ぜろくんでんせつ');
write('');

return{
focusTarget:input,
dispose:()=>{
if(disposed)return;
disposed=true;
window.removeEventListener('zero:devicehackchange',onHackChange);
}
};
}

const appLaunchers={terminal:openTerminal,calculator:openCalculator,paint:openPaint,notepad:openNotepad,browser:openBrowser};
document.querySelectorAll('[data-launch-app]').forEach(button=>{
const launch=appLaunchers[button.dataset.launchApp];
if(launch)button.addEventListener('click',launch);
});
window.addEventListener('resize',()=>windows.forEach(clampWindow),{passive:true});
window.addEventListener('zero:devicehackchange',()=>windows.forEach(item=>item.element.dataset.windowSystem=document.documentElement.dataset.windowSystem));

window.zeroSiteDesktop={openTerminal,openCalculator,openPaint,openNotepad,openBrowser,getWindows:()=>[...windows.values()].map(({id,title,appId,minimized,maximized})=>({id,title,appId,minimized,maximized}))};
})();
