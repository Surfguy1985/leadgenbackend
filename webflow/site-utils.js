(function(){var P=new URLSearchParams(location.search),ref=(P.get('ref')||'').replace(/[^\w-]/g,'').slice(0,40);try{if(ref)localStorage.setItem('cf_ref',ref);else ref=localStorage.getItem('cf_ref')||''}catch(e){}
function n(s){return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
document.addEventListener('DOMContentLoaded',function(){
if(ref){document.querySelectorAll('a[href]').forEach(function(a){try{var u=new URL(a.href,location.href);if(/archangel-leadgen\.vercel\.app$/.test(u.hostname)||u.pathname.indexOf('/for-contractors')===0){if(!u.searchParams.get('ref')){u.searchParams.set('ref',ref);a.href=u.toString()}}}catch(e){}})}
var t=n(P.get('trade')),c=n(P.get('city')),q=n(P.get('q'));
if(!t&&!c&&!q)return;var cards=document.querySelectorAll('.ol-card[data-trade],.ol-card[data-name]'),shown=0;
cards.forEach(function(el){var ok=true;if(t&&el.dataset.trade!==undefined)ok=n(el.dataset.trade)===t;if(ok&&c)ok=n(el.dataset.city)===c;if(ok&&q)ok=(n(el.dataset.name)+' '+n(el.dataset.city)).indexOf(q)>-1;var it=el.closest('.w-dyn-item')||el;it.style.display=ok?'':'none';if(ok)shown++});
if(cards.length){var lst=document.querySelector('.w-dyn-list');if(lst){var m=document.createElement('p');m.className='cf-filter-note';m.setAttribute('role','status');m.textContent=(shown?'Showing '+shown+' match'+(shown===1?'':'es'):'No matches')+' for your filter. ';var a=document.createElement('a');a.href=location.pathname;a.textContent='Clear filter';m.appendChild(a);lst.parentNode.insertBefore(m,lst)}}
var i=document.getElementById('cfc-q');if(i&&q)i.value=P.get('q')});})();
