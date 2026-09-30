(() => {
  const key='watchlist-theme';
  let current='lime';
  try { if(localStorage.getItem(key)==='pink')current='pink'; } catch {}
  function apply(theme){
    current=theme==='pink'?'pink':'lime';
    document.documentElement.dataset.theme=current;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',current==='pink'?'#160f18':'#0b0c10');
    document.querySelectorAll('[data-theme-choice]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.themeChoice===current)));
  }
  apply(current);
  document.addEventListener('DOMContentLoaded',()=>{
    apply(current);
    document.querySelector('#themeChoices').addEventListener('click',event=>{
      const button=event.target.closest('[data-theme-choice]');if(!button)return;
      apply(button.dataset.themeChoice);
      try{localStorage.setItem(key,current);document.querySelector('#themeNote').textContent='Тема сохранена для этого браузера.';}catch{document.querySelector('#themeNote').textContent='Тема применена. Браузер не разрешил сохранить выбор.';}
    });
  });
  window.addEventListener('storage',event=>{if(event.key===key)apply(event.newValue)});
})();
