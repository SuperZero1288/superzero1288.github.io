(()=>{
'use strict';

const controller=window.zeroSiteController;
if(!controller)return;

const MAX_WINDOWS=10;
const windows=new Map();
let nextWindowId=1;
let topZ=12010;
let cascadeIndex=0;

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
button.innerHTML='<span aria-hidden="true">&gt;_</span><b></b>';
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

function createWindow({title='アプリ',appId='app',width=760,height=480,build}){
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

const content=document.createElement('div');
content.className='app-window-content';
element.append(titlebar,content);
layer.appendChild(element);

const record={id,title,appId,element,content,minimized:false,maximized:false,restoreRect:null,taskButton:null,focusTarget:null,dispose:null,maximizeButton:titlebar.querySelector('[data-window-action="maximize"]')};
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
openTerminal:()=>openTerminal()
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
break;
}
if(sub==='terminal'){openTerminal();write('新しいターミナルを開きました','success');break;}
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
const commands=['help','device','theme','mode','clock','settings','hack','open','new','windows','window','minimize','maximize','close','date','whoami','ver','history','clear'];
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

document.querySelectorAll('[data-launch-app="terminal"]').forEach(button=>button.addEventListener('click',openTerminal));
window.addEventListener('resize',()=>windows.forEach(clampWindow),{passive:true});
window.addEventListener('zero:devicehackchange',()=>windows.forEach(item=>item.element.dataset.windowSystem=document.documentElement.dataset.windowSystem));

window.zeroSiteDesktop={openTerminal,getWindows:()=>[...windows.values()].map(({id,title,appId,minimized,maximized})=>({id,title,appId,minimized,maximized}))};
})();
