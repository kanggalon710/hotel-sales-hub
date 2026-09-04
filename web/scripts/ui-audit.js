(()=>{const vw=document.documentElement.clientWidth,vh=innerHeight,issues=[];
if(document.documentElement.scrollWidth>vw+1)issues.push({t:'overflow-x',d:`${document.documentElement.scrollWidth}/${vw}`});
const clipped=[];for(const el of document.querySelectorAll('main *')){if(el.children.length)continue;const x=(el.textContent||'').trim();if(!x||x.length<3)continue;const cs=getComputedStyle(el);if(cs.textOverflow==='ellipsis'||cs.overflow==='hidden')continue;if(el.scrollWidth>el.clientWidth+1&&el.clientWidth>0)clipped.push(x.slice(0,40));}
if(clipped.length)issues.push({t:'clipped',d:[...new Set(clipped)].slice(0,5)});
const main=document.querySelector('main');
if(main){const mr=main.getBoundingClientRect(),esc=[];for(const el of main.querySelectorAll('*')){const r=el.getBoundingClientRect();if(r.width===0)continue;if(r.right>mr.right+2||r.left<mr.left-2){if(!el.closest('[class*=overflow-x],[class*=scroll-x]'))esc.push((el.textContent||el.tagName).trim().slice(0,32));}}if(esc.length)issues.push({t:'escapes',d:[...new Set(esc)].slice(0,4)});}
if(vw<640){const s=[];for(const el of document.querySelectorAll('main button, main a[href], header button')){const r=el.getBoundingClientRect();if(r.width===0||r.height===0)continue;if(r.height<32)s.push(`${(el.getAttribute('aria-label')||el.textContent||'').trim().slice(0,22)}:${Math.round(r.height)}`);}if(s.length)issues.push({t:'small-tap',d:[...new Set(s)].slice(0,6)});}
const bt=(main?.textContent||'').trim();if(bt.length<40)issues.push({t:'empty',d:bt.slice(0,50)});
const fc=document.querySelector('main section.panel, main table, main ul li');
return JSON.stringify({p:location.pathname,vw,pct:fc?Math.round((fc.getBoundingClientRect().top/vh)*100):null,issues})})()
