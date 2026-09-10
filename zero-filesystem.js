(()=>{
'use strict';

const entries=[
{path:'/',type:'directory',label:'ZERO',icon:'◈'},
{path:'/home',type:'directory',label:'ホーム',icon:'⌂'},
{path:'/home/profile',type:'app',label:'詳しいプロフィール',app:'profile',icon:'ID'},
{path:'/home/links',type:'page',label:'リンクたち',url:'/links.html',icon:'↗'},
{path:'/home/blog',type:'directory',label:'ブログ',icon:'▤'},
{path:'/home/blog/latest',type:'page',label:'最新のnote記事',action:'latest-note',icon:'N'},
{path:'/home/blog/n8d41d4a76214',type:'page',label:'305SHを今更MIUI化',url:'/blog/n8d41d4a76214.html',icon:'N'},
{path:'/home/vrchat-assets',type:'page',label:'VRChat向けアセット',url:'/vrchat-assets/',icon:'V',planned:true},
{path:'/home/apps',type:'directory',label:'アプリ',icon:'▦'},
{path:'/home/apps/terminal',type:'app',label:'ターミナル',app:'terminal',icon:'>_'},
{path:'/home/apps/explorer',type:'app',label:'ファイル エクスプローラー',app:'explorer',icon:'▣'},
{path:'/home/apps/calculator',type:'app',label:'電卓',app:'calculator',icon:'＋'},
{path:'/home/apps/paint',type:'app',label:'ペイント',app:'paint',icon:'✎'},
{path:'/home/apps/notepad',type:'app',label:'メモ帳',app:'notepad',icon:'≡'},
{path:'/home/apps/browser',type:'app',label:'ウェブ ブラウザ',app:'browser',icon:'◎'},
{path:'/network',type:'directory',label:'ネットワーク',icon:'◎'},
{path:'/network/x',type:'external',label:'Twitter / X',url:'https://x.com/ZErrrrrO_VRC',icon:'X'},
{path:'/network/youtube',type:'external',label:'YouTube',url:'https://www.youtube.com/@ZErrrrrO_VRC',icon:'▶'},
{path:'/network/note',type:'external',label:'note',url:'https://note.com/zerrrrro_1288',icon:'N'},
{path:'/network/booth',type:'external',label:'BOOTH',url:'https://zerrrrro.booth.pm/',icon:'B'},
{path:'/network/github',type:'external',label:'GitHub',url:'https://github.com/SuperZero1288',icon:'G'},
{path:'/system',type:'directory',label:'システム',icon:'⚙'},
{path:'/system/device.info',type:'dynamic',label:'この端末について',dynamic:'device',icon:'i'},
{path:'/system/settings.conf',type:'dynamic',label:'表示設定',dynamic:'settings',icon:'⚙'},
{path:'/system/.bootlog',type:'file',label:'.bootlog',hidden:true,icon:'·',content:'ZERO SITE OS\nboot: ok\nfilesystem: virtual\nnetwork: browser controlled\nstatus: ready'},
{path:'/.zero',type:'directory',label:'.zero',hidden:true,icon:'◇'},
{path:'/.zero/readme.txt',type:'file',label:'readme.txt',icon:'TXT',content:'見つけてくれてありがとう。\nこのサイトは、ページであり、端末でもあります。\nまだ空いている場所には、これから面白いものが増える予定です。'},
{path:'/.zero/.signal',type:'file',label:'.signal',hidden:true,icon:'?',content:'signal received // 0x5A45524F\nTry: help --all'},
{path:'/.zero/door',type:'file',label:'door',hidden:true,icon:'?',content:'扉は開いている。けれど、行き先はまだ作られていない。'}
];

const aliases=new Map([
['/profile','/home/profile'],['/about','/home/profile'],['/links','/home/links'],
['/blog','/home/blog'],['/article','/home/blog/latest'],['/apps','/home/apps'],
['/assets','/home/vrchat-assets'],['/vrchat-assets','/home/vrchat-assets'],
['/terminal','/home/apps/terminal'],['/explorer','/home/apps/explorer']
]);
const entryMap=new Map(entries.map(entry=>[entry.path,Object.freeze({...entry})]));

function slashPath(value){
let path=String(value??'').trim();
if(!path)return'';
path=path.replace(/^['"]|['"]$/g,'').replace(/\\/g,'/');
const driveRoot=/^([a-z]):\/zero(?=\/|$)/i;
if(driveRoot.test(path))path=path.replace(driveRoot,'')||'/';
path=path.replace(/^~(?=\/|$)/,'/home');
return path;
}

function normalize(value,cwd='/home'){
let path=slashPath(value);
if(!path)path=cwd||'/home';
if(!path.startsWith('/'))path=`${cwd.replace(/\/$/,'')}/${path}`;
const parts=[];
path.split('/').forEach(part=>{
if(!part||part==='.')return;
if(part==='..'){parts.pop();return;}
parts.push(part);
});
const normalized=`/${parts.join('/')}`||'/';
return aliases.get(normalized)||normalized;
}

function get(path,cwd='/home'){return entryMap.get(normalize(path,cwd))||null;}
function parent(path){
const normalized=normalize(path,'/');
if(normalized==='/')return'/';
const parts=normalized.split('/');
parts.pop();
return parts.join('/')||'/';
}
function name(path){return normalize(path,'/').split('/').filter(Boolean).pop()||'/';}
function list(path='/home',{hidden=false}={}){
const normalized=normalize(path,'/');
return entries.filter(entry=>entry.path!==normalized&&parent(entry.path)===normalized&&(hidden||!entry.hidden));
}
function childrenNames(path='/home',{hidden=false}={}){return list(path,{hidden}).map(entry=>name(entry.path));}
function resolve(input,cwd='/home'){return normalize(input,cwd);}
function isDirectory(path,cwd='/home'){return get(path,cwd)?.type==='directory';}
function toDisplayPath(path,system='windows'){
const normalized=normalize(path,'/');
if(system==='macos')return normalized==='/home'?'~':normalized.replace(/^\/home(?=\/|$)/,'~');
return normalized==='/'?'C:\\ZERO':`C:\\ZERO${normalized.replace(/\//g,'\\')}`;
}
function complete(partial,cwd='/home',{hidden=false}={}){
const source=slashPath(partial);
const separatorIndex=Math.max(source.lastIndexOf('/'),source.lastIndexOf('\\'));
const directoryPart=separatorIndex>=0?source.slice(0,separatorIndex+1):'';
const fragment=separatorIndex>=0?source.slice(separatorIndex+1):source;
const base=directoryPart?normalize(directoryPart,cwd):cwd;
const separator=source.includes('\\')?'\\':'/';
return list(base,{hidden}).filter(entry=>name(entry.path).toLowerCase().startsWith(fragment.toLowerCase())).map(entry=>{
const suffix=entry.type==='directory'?separator:'';
return `${directoryPart}${name(entry.path)}${suffix}`;
});
}
function walk(path='/',{hidden=false,depth=0}={}){
const root=get(path,'/');
if(!root||root.type!=='directory')return[];
const lines=[];
const visit=(directory,prefix,level)=>{
const children=list(directory,{hidden});
children.forEach((entry,index)=>{
const last=index===children.length-1;
lines.push(`${prefix}${last?'└─':'├─'} ${name(entry.path)}${entry.type==='directory'?'/':''}`);
if(entry.type==='directory'&&(depth<=0||level<depth))visit(entry.path,`${prefix}${last?'   ':'│  '}`,level+1);
});
};
visit(root.path,'',1);
return lines;
}

window.zeroVfs={entries:entries.map(entry=>({...entry})),normalize,resolve,get,list,parent,name,isDirectory,toDisplayPath,complete,walk};
})();
