/* Instituto Aeviternitas · barra da Rádio Aevum · 13/09/2026.
   Selo discreto no canto; ao tocar vira barra com pausa, próxima e janela própria.
   Guarda faixa e posição em localStorage, então a escuta atravessa a navegação do site.
   Sem o caractere e-comercial em lugar nenhum: o WordPress o converte em entidade e quebra o script. */
(function(){
  if(window.AEV_RADIO)return;window.AEV_RADIO=1;
  var BASE='https://braugar-maker.github.io/Radio/';
  var CHAVE='aev-radio',CHAVEV='aev-radio-nivel';
  var aqui=location.pathname.replace(/\/+$/,'');
  if(aqui==='/radio')return;
  var dados=null,ordem=[],pos=-1,pronto=false,ultimo=0;
  var au=new Audio();au.preload='none';
  function ler(){try{return JSON.parse(localStorage.getItem(CHAVE))}catch(e){return null}}
  function grava(t){try{localStorage.setItem(CHAVE,JSON.stringify({i:pos,t:t||0,tocando:!au.paused,dia:hoje()}))}catch(e){}}
  function limpa(){try{localStorage.removeItem(CHAVE)}catch(e){}}
  function hoje(){return (new Date()).toISOString().slice(0,10)}
  var semente=hoje().replace(/-/g,'')|0;
  function rnd(){semente=(semente*48271)%2147483647;return semente/2147483647}
  function monta(){
    ordem=dados.map(function(d,i){return i});
    for(var i=ordem.length-1;i>0;i--){var j=Math.floor(rnd()*(i+1));var t=ordem[i];ordem[i]=ordem[j];ordem[j]=t}
  }
  function baixa(depois){
    if(dados){depois();return}
    fetch(BASE+'catalogo.json').then(function(r){return r.json()}).then(function(j){
      dados=(j.gravacoes||[]).filter(function(d){return d.mp3});
      monta();depois();
    }).catch(function(){obra.textContent='A rádio não respondeu.'});
  }
  /* estrutura */
  var SVG='http://www.w3.org/2000/svg';
  function icone(caminhos,classe){
    var s=document.createElementNS(SVG,'svg');s.setAttribute('viewBox','0 0 40 40');s.setAttribute('aria-hidden','true');
    if(classe)s.setAttribute('class',classe);
    caminhos.forEach(function(d){var p=document.createElementNS(SVG,'path');p.setAttribute('d',d);s.appendChild(p)});
    return s;
  }
  var cx=document.createElement('div');cx.className='aev-radio aev-radio-min';cx.id='aev-radio';
  var selo=document.createElement('button');selo.type='button';selo.className='aev-r-selo';selo.setAttribute('aria-label','Tocar a Rádio Aevum');
  selo.appendChild(icone(['M14 10l16 10-16 10z'],'ico-play'));
  selo.appendChild(icone(['M13 10h6v20h-6z','M21 10h6v20h-6z'],'ico-pause'));
  var info=document.createElement('div');info.className='aev-r-info';
  var rot=document.createElement('p');rot.className='aev-r-rot';rot.textContent='[ No ar ]';
  var obra=document.createElement('p');obra.className='aev-r-obra';obra.textContent='Rádio Aevum';
  var quem=document.createElement('p');quem.className='aev-r-quem';quem.textContent='Gravações em domínio público';
  var linha=document.createElement('div');linha.className='aev-r-linha';
  var curso=document.createElement('span');linha.appendChild(curso);
  info.appendChild(rot);info.appendChild(obra);info.appendChild(quem);info.appendChild(linha);
  function botao(rotulo,caminhos){
    var b=document.createElement('button');b.type='button';b.className='aev-r-b';b.setAttribute('aria-label',rotulo);b.title=rotulo;
    b.appendChild(icone(caminhos));return b;
  }
  /* volume em três degraus: cada toque sobe um degrau e, do alto, volta ao mudo */
  var NIVEIS=[0,0.34,0.67,1],NOMES=['mudo','baixo','médio','alto'];
  var vol=document.createElement('button');vol.type='button';vol.className='aev-r-b aev-r-vol';
  for(var kb=0;kb<3;kb++)vol.appendChild(document.createElement('i'));
  var podeVolume=(function(){var t=document.createElement('audio');t.volume=0.5;return t.volume===0.5;})();
  var nv=3;try{var gv=localStorage.getItem(CHAVEV);if(gv!==null)nv=Math.max(0,Math.min(3,parseInt(gv,10)));}catch(e){}
  function poeVol(){
    au.volume=NIVEIS[nv];au.muted=(nv===0);
    vol.setAttribute('data-n',String(nv));
    vol.setAttribute('aria-label','Volume: '+NOMES[nv]);vol.title=vol.getAttribute('aria-label');
    try{localStorage.setItem(CHAVEV,String(nv));}catch(e){}
  }
  vol.addEventListener('click',function(){nv=(nv+1)%4;poeVol();});
  poeVol();if(!podeVolume)vol.style.display='none';
  var prox=botao('Próxima gravação',['M11 10l13 10-13 10z','M26 10h3v20h-3z']);
  var jan=botao('Abrir em janela própria',['M16 11h13v13h-3v-8h-10z','M11 16h13v13h-13z']);
  var fecha=botao('Fechar a rádio',['M12 14l2-2 6 6 6-6 2 2-6 6 6 6-2 2-6-6-6 6-2-2 6-6z']);
  cx.appendChild(selo);cx.appendChild(info);cx.appendChild(vol);cx.appendChild(prox);cx.appendChild(jan);cx.appendChild(fecha);
  /* comportamento */
  function quatro(v){var m=String(v||'').match(/\d{4}/);return m?m[0]:'';}
  function mostra(){
    var d=dados[pos];if(!d)return;
    obra.textContent=d['em portugues']||d.obra||'';
    quem.textContent=[String(d.compositor||'').split(' (')[0],d.interprete,quatro(d['ano da gravacao'])].filter(Boolean).join(' · ');
    if('mediaSession' in navigator){
      try{navigator.mediaSession.metadata=new MediaMetadata({title:obra.textContent,artist:quem.textContent,album:'Rádio Aevum · Instituto Aeviternitas'})}catch(e){}
    }
  }
  function abre(){cx.classList.remove('aev-radio-min')}
  function estado(){
    var t=!au.paused;
    selo.setAttribute('aria-pressed',t?'true':'false');
    selo.setAttribute('aria-label',t?'Pausar':'Tocar');
    cx.classList.toggle('aev-r-tocando',t);
  }
  function toca(i){
    pos=i;var d=dados[i];if(!d)return;
    au.src=BASE+d.mp3;
    var p=au.play();
    if(p)p.catch(function(){estado()});
    mostra();estado();grava(0);
  }
  function segue(passo){
    if(!ordem.length)monta();
    var k=ordem.indexOf(pos);k=(k+(passo||1)+ordem.length)%ordem.length;
    toca(ordem[k]);
  }
  selo.addEventListener('click',function(){
    abre();
    if(pos<0){baixa(function(){toca(ordem[0])});return}
    if(au.paused){var p=au.play();if(p)p.catch(function(){estado()})}else{au.pause()}
    estado();grava(au.currentTime);
  });
  prox.addEventListener('click',function(){abre();baixa(function(){segue(1)})});
  jan.addEventListener('click',function(){
    au.pause();estado();grava(au.currentTime);
    window.open(BASE+'player.html','aevradio','width=460,height=820');
  });
  fecha.addEventListener('click',function(){
    au.pause();au.removeAttribute('src');pos=-1;limpa();
    cx.classList.add('aev-radio-min');cx.classList.remove('aev-r-tocando');
    selo.setAttribute('aria-pressed','false');selo.setAttribute('aria-label','Tocar a Rádio Aevum');
  });
  au.addEventListener('ended',function(){segue(1)});
  au.addEventListener('play',estado);
  au.addEventListener('pause',estado);
  au.addEventListener('timeupdate',function(){
    if(au.duration)curso.style.width=(au.currentTime/au.duration*100).toFixed(2)+'%';
    var n=Date.now();if(n-ultimo>4000){ultimo=n;grava(au.currentTime)}
  });
  window.addEventListener('pagehide',function(){if(pos>=0)grava(au.currentTime)});
  /* retomada: se a escuta começou noutra página, a barra volta de onde parou */
  function retoma(){
    var e=ler();if(!e)return;if(e.i==null)return;if(e.i<0)return;
    abre();
    baixa(function(){
      pos=e.i;var d=dados[pos];if(!d)return;
      au.src=BASE+d.mp3;
      au.currentTime=e.t||0;
      mostra();
      if(e.tocando){var p=au.play();if(p)p.catch(function(){estado()})}
      estado();
    });
  }
  function entra(){document.body.appendChild(cx);retoma()}
  if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',entra)}else{entra()}
})();
