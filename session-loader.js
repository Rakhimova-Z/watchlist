// Delay the indicator, then give it enough screen time to avoid a flash.
(() => {
  const screen=document.querySelector('#sessionLoading');
  let revealTimer,finishTimer,shownAt=null;
  function begin(){
    clearTimeout(revealTimer);clearTimeout(finishTimer);shownAt=null;
    screen.classList.add('is-pending');
    revealTimer=setTimeout(()=>{shownAt=performance.now();screen.classList.remove('is-pending')},300);
  }
  function finish(callback){
    clearTimeout(revealTimer);clearTimeout(finishTimer);
    const remaining=shownAt===null?0:Math.max(0,450-(performance.now()-shownAt));
    const done=()=>{shownAt=null;callback()};
    if(remaining)finishTimer=setTimeout(done,remaining);else done();
  }
  function fail(){clearTimeout(revealTimer);clearTimeout(finishTimer);shownAt=null;screen.classList.remove('is-pending')}
  window.sessionLoader={begin,finish,fail};
  begin();
})();
