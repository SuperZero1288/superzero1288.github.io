(() => {
  if (document.querySelector('.floating-status-bar')) return;

  const SVG_SUN='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 18a6 6 0 1 1 0-12 6 6 0 0 1 0 12Zm-1-17h2v3h-2V1Zm0 19h2v3h-2v-3ZM3.5 4.9l1.4-1.4L7 5.6 5.6 7 3.5 4.9Zm13.4 13.5 1.5-1.5 2.1 2.2-1.4 1.4-2.2-2.1Zm2.2-14.9 1.4 1.4L18.4 7 17 5.6l2.1-2.1ZM5.6 17 7 18.4l-2.1 2.1-1.4-1.4L5.6 17ZM23 11v2h-3v-2h3ZM4 11v2H1v-2h3Z"/></svg>';
  const SVG_MOON='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M11.4 2C9.9 3.4 9 5.3 9 7.5A7.5 7.5 0 0 0 16.5 15c2.2 0 4.1-.9 5.5-2.4A10 10 0 1 1 11.4 2Z"/></svg>';
  const styles=[
    {id:'style-default',name:'Default',light:true},
    {id:'style-material',name:'Material',light:true},
    {id:'style-liquidglass',name:'LiquidGlass',light:true},
    {id:'style-fluent',name:'Fluent Design',light:true},
    {id:'style-vrchat',name:'VRChat UI',light:false},
    {id:'style-unity',name:'Unity Engine',light:false}
  ];

  document.body.insertAdjacentHTML('afterbegin',`
    <div class="floating-status-bar page-floating-bar">
      <a class="status-capsule icon-btn" href="/" title="トップページへ戻る" aria-label="トップページへ戻る"><span class="svg-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M10.7 2.3 1 12l9.7 9.7 1.4-1.4L4.8 13H23v-2H4.8l7.3-7.3-1.4-1.4Z"/></svg></span></a>
      <div class="status-capsule time-capsule"><span class="status-time" id="pageStatusTime">--:--</span></div>
      <div class="status-right-group">
        <button class="status-capsule icon-btn" id="pageStyleToggle" type="button" title="UIデザイン切り替え" aria-label="UIデザイン切り替え"><span class="svg-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 17.9A8 8 0 0 1 6.2 10.2L9 15v1a2 2 0 0 0 2 2v1.9Zm4-3.9v-3a1 1 0 0 0-1-1H8v-2h2a1 1 0 0 0 1-1V7h2a2 2 0 0 0 2-2v-.4A8 8 0 0 1 17.9 17H17Z"/></svg></span></button>
        <button class="status-capsule icon-btn" id="pageThemeToggle" type="button" title="ダーク/ライト切り替え" aria-label="ダーク/ライト切り替え"><span class="svg-icon" id="pageThemeIcon"></span></button>
      </div>
    </div>
    <div class="toast-notification" id="pageBarToast" role="status" aria-live="polite"></div>`);

  const time=document.getElementById('pageStatusTime');
  const styleButton=document.getElementById('pageStyleToggle');
  const themeButton=document.getElementById('pageThemeToggle');
  const themeIcon=document.getElementById('pageThemeIcon');
  const toast=document.getElementById('pageBarToast');
  let styleIndex=Math.max(0,styles.findIndex((style)=>document.body.classList.contains(style.id)));
  let toastTimer;

  const updateTime=()=>{
    const now=new Date();
    time.textContent=`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  };
  const showToast=(text)=>{
    toast.textContent=text;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer=setTimeout(()=>toast.classList.remove('show'),1800);
  };
  const updateThemeButton=()=>{
    const light=document.body.classList.contains('light-theme');
    themeButton.disabled=!styles[styleIndex].light;
    themeButton.title=styles[styleIndex].light?'ダーク/ライト切り替え':'このテーマはライトモードに対応していません';
    themeIcon.innerHTML=light?SVG_SUN:SVG_MOON;
  };

  styleButton.addEventListener('click',()=>{
    document.body.classList.remove(styles[styleIndex].id);
    styleIndex=(styleIndex+1)%styles.length;
    const style=styles[styleIndex];
    document.body.classList.add(style.id);
    if(!style.light&&document.body.classList.contains('light-theme'))document.body.classList.remove('light-theme');
    showToast(style.light?style.name:`${style.name} はダークモードのみ対応`);
    updateThemeButton();
  });
  themeButton.addEventListener('click',()=>{
    if(!styles[styleIndex].light)return;
    document.body.classList.toggle('light-theme');
    updateThemeButton();
  });

  updateTime();
  setInterval(updateTime,1000);
  updateThemeButton();
})();
