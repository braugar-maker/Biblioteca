/* Instituto Aeviternitas · leitor da Biblioteca Aevum · orquestrador · 14/09/2026.
   Abre o EPUB do proprio acervo, monta o rio de capitulos, guarda onde a pessoa parou,
   o marcador e o gosto de leitura. Sem epub.js, sem iframe. */
(function () {
  'use strict';

  var PREF = 'aev-leitor-gosto';
  var POS = 'aev-leitor-pos-';
  var MARCA = 'aev-leitor-marcas-';
  var DIM = 'aev-leitor-dim-';
  var ao = document.getElementById.bind(document);

  function guarda(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function lembra(k, padrao) {
    try { var v = localStorage.getItem(k); return v === null ? padrao : JSON.parse(v); }
    catch (e) { return padrao; }
  }
  function param(n) { return new URLSearchParams(location.search).get(n) || ''; }

  var gosto = lembra(PREF, { papel: 'escuro', corpo: 106, entre: 1.62, margem: 24, letra: 'serif', medida: 34 });
  var arq = param('arq');
  var slug = arq.split('/').pop().replace(/\.epub$/i, '');
  var pacote = null, rio = null, docs = [], letrasTotais = 0, sumario = [], pilha = [];
  var rolando = false, tempoRolagem = null, gravaTempo = null, ultimaPos = null;

  /* ------------------------------------------------------------------ paineis */
  var veu = ao('veu');
  function abrePainel(qual) {
    ['p-sumario', 'p-busca', 'p-aparencia'].forEach(function (id) {
      ao(id).classList.toggle('aberto', id === qual);
    });
    veu.classList.add('aberto');
  }
  function fecha() {
    ['p-sumario', 'p-busca', 'p-aparencia'].forEach(function (id) { ao(id).classList.remove('aberto'); });
    veu.classList.remove('aberto');
  }
  veu.addEventListener('click', fecha);
  Array.prototype.forEach.call(document.querySelectorAll('[data-fecha]'), function (b) {
    b.addEventListener('click', fecha);
  });
  ao('b-sumario').addEventListener('click', function () { abrePainel('p-sumario'); });
  ao('b-aparencia').addEventListener('click', function () { abrePainel('p-aparencia'); });
  ao('b-busca').addEventListener('click', function () { abrePainel('p-busca'); ao('q').focus(); });

  /* ------------------------------------------------------------------ aparencia */
  var PAPEIS = {
    escuro: { fundo: '#201E1D', tinta: '#DCD3C4', elo: '#C08A3E', regua: '#645C50', quieto: '#C0B6A5' },
    claro:  { fundo: '#F5EAD8', tinta: '#221F1C', elo: '#8C491A', regua: '#C0B6A5', quieto: '#645C50' },
    sepia:  { fundo: '#EBDDC5', tinta: '#2A2622', elo: '#8C491A', regua: '#C3B49A', quieto: '#6B6053' }
  };
  var LETRAS = { serif: '"EB Garamond", Georgia, serif', sans: 'Figtree, system-ui, sans-serif' };

  function pinta() {
    var p = PAPEIS[gosto.papel] || PAPEIS.escuro;
    var r = document.documentElement.style;
    document.body.setAttribute('data-papel', gosto.papel);
    r.setProperty('--tinta', p.tinta);
    r.setProperty('--elo', p.elo);
    r.setProperty('--regua', p.regua);
    r.setProperty('--quieto', p.quieto);
    r.setProperty('--corpo', (gosto.corpo / 100) + 'rem');
    r.setProperty('--entre', String(gosto.entre));
    r.setProperty('--margem', gosto.margem + 'px');
    r.setProperty('--medida', gosto.medida + 'em');
    r.setProperty('--letra', LETRAS[gosto.letra] || LETRAS.serif);
    marca('g-papel', 'papel', gosto.papel);
    marca('g-corpo', 'corpo', String(gosto.corpo));
    marca('g-entre', 'entre', String(gosto.entre));
    marca('g-margem', 'margem', String(gosto.margem));
    marca('g-letra', 'letra', gosto.letra);
    marca('g-medida', 'medida', String(gosto.medida));
  }
  function marca(id, chave, valor) {
    var g = ao(id);
    if (!g) return;
    Array.prototype.forEach.call(g.children, function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-' + chave) === valor ? 'true' : 'false');
    });
  }
  [['g-papel', 'papel', 's'], ['g-corpo', 'corpo', 'n'], ['g-entre', 'entre', 'f'],
   ['g-margem', 'margem', 'n'], ['g-letra', 'letra', 's'], ['g-medida', 'medida', 'n']]
    .forEach(function (par) {
      var g = ao(par[0]);
      if (!g) return;
      g.addEventListener('click', function (ev) {
        var b = ev.target.closest('[data-' + par[1] + ']');
        if (!b) return;
        var v = b.getAttribute('data-' + par[1]);
        gosto[par[1]] = par[2] === 'n' ? parseInt(v, 10) : (par[2] === 'f' ? parseFloat(v) : v);
        guarda(PREF, gosto);
        var antes = rio ? rio.localiza() : null;
        pinta();
        if (antes) requestAnimationFrame(function () { rio.vaiPara(antes); });
      });
    });

  /* ------------------------------------------------------------------ marcadores */
  function marcas() { return lembra(MARCA + slug, []); }
  function desenhaMarcas() {
    var lista = marcas(), alvo = ao('marcas');
    alvo.innerHTML = '';
    if (!lista.length) {
      var vazio = document.createElement('li');
      vazio.className = 'aev-vazio-nota';
      vazio.textContent = 'Nenhum ainda. O botão da fita guarda a página.';
      alvo.appendChild(vazio);
      return;
    }
    lista.forEach(function (m, i) {
      var li = document.createElement('li');
      var x = document.createElement('button');
      x.className = 'tirar'; x.textContent = 'tirar';
      x.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        var l = marcas(); l.splice(i, 1); guarda(MARCA + slug, l); desenhaMarcas(); acendeMarca();
      });
      var a = document.createElement('a');
      a.href = '#';
      a.textContent = m.rotulo || 'Marcador';
      a.addEventListener('click', function (e) { e.preventDefault(); rio.vaiPara(m.loc || m); fecha(); });
      li.appendChild(x); li.appendChild(a); alvo.appendChild(li);
    });
  }
  function mesmaMarca(m, loc) {
    var l = m.loc || m;
    return l && loc && l.d === loc.d && Math.abs((l.b | 0) - (loc.b | 0)) < 1;
  }
  function acendeMarca() {
    if (!ultimaPos) return;
    ao('b-marca').setAttribute('aria-pressed', marcas().some(function (m) { return mesmaMarca(m, ultimaPos); }) ? 'true' : 'false');
  }
  ao('b-marca').addEventListener('click', function () {
    if (!ultimaPos) return;
    var l = marcas();
    var i = l.findIndex(function (m) { return mesmaMarca(m, ultimaPos); });
    if (i >= 0) l.splice(i, 1);
    else l.push({ loc: ultimaPos, rotulo: rotulo(ultimaPos) });
    guarda(MARCA + slug, l); desenhaMarcas(); acendeMarca();
  });
  function rotulo(loc) {
    var t = (loc.txt || '').trim();
    var pc = Math.round((loc.pct || 0) * 100) + '%';
    return pc + (t ? ' · ' + t.slice(0, 38) : '');
  }

  /* ------------------------------------------------------------------ rodape */
  function atualizaRodape(loc) {
    if (!loc) return;
    ao('andado').style.width = ((loc.pct || 0) * 100).toFixed(1) + '%';
    ao('pct').textContent = Math.round((loc.pct || 0) * 100) + '%';
    var nome = '';
    for (var i = 0; i < sumario.length; i++) {
      if (sumario[i].d === loc.d) { nome = sumario[i].rotulo; break; }
      if (sumario[i].d > loc.d) break;
      nome = sumario[i].rotulo;
    }
    ao('cap').textContent = nome.length > 46 ? nome.slice(0, 44).trim() + '...' : nome;
  }

  function aoMover() {
    if (!rio) return;
    var loc = rio.localiza();
    if (!loc) return;
    ultimaPos = loc;
    atualizaRodape(loc);
    acendeMarca();
    clearTimeout(gravaTempo);
    gravaTempo = setTimeout(function () { guarda(POS + slug, loc); }, 1200);
  }

  /* ------------------------------------------------------------------ abertura */
  if (!arq) {
    ao('aviso').textContent = 'Nenhum livro indicado. Volte à Biblioteca e escolha uma obra.';
    return;
  }
  pinta();

  var titulo = '', autor = '';
  fetch('catalogo.json').then(function (r) { return r.json(); }).then(function (j) {
    var o = (j.obras || []).filter(function (x) { return x.arq === arq; })[0];
    if (o) { titulo = o.t; autor = o.a; }
  }).catch(function () {}).then(function () {
    ao('ob').textContent = titulo || slug;
    ao('au').textContent = autor || '';
    document.title = (titulo || slug) + ' · Biblioteca Aevum';
    return fetch(arq);
  }).then(function (r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.arrayBuffer();
  }).then(function (bytes) {
    return AEV.Pacote.abre(bytes);
  }).then(function (p) {
    pacote = p;
    return conta(p);
  }).then(function (dados) {
    montaRio(dados);
  }).catch(function (e) {
    ao('aviso').textContent = 'Não consegui abrir este livro. Baixe o EPUB pela Biblioteca.';
    ao('aviso').style.display = 'flex';
  });

  /* conta os caracteres de cada capitulo, para o avanco ser em texto e nao em pixel */
  function conta(p) {
    var itens = p.lombada.filter(function (i) { return /xhtml|html/.test(i.tipo); });
    var limite = itens.length > 200;
    return Promise.all(itens.map(function (item) {
      if (limite) return Promise.resolve({ item: item, letras: 2000 });
      return p.textoDe(item.caminho).then(function (t) {
        return { item: item, letras: t.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').length };
      }).catch(function () { return { item: item, letras: 1000 }; });
    })).then(function (lista) {
      var antes = 0;
      lista.forEach(function (d) { d.antes = antes; antes += d.letras; });
      letrasTotais = antes;
      return lista;
    });
  }

  function montaRio(dados) {
    docs = dados;
    var dims = lembra(DIM + slug, {});
    rio = AEV.Rio.cria(ao('rio'), dados, {
      pacote: pacote,
      dimensoes: dims,
      letrasTotais: letrasTotais,
      estaRolando: function () { return rolando; },
      resolve: function (item, href) {
        var base = item.caminho.indexOf('/') >= 0 ? item.caminho.slice(0, item.caminho.lastIndexOf('/')) : '';
        return AEV.Pacote.junta(base, decodeURIComponent(href.split('#')[0]));
      },
      corpoDe: function (item) {
        return pacote.textoDe(item.caminho).then(function (t) { return AEV.Limpa.limpa(t, {}); });
      },
      aoMedirImagem: function (d) { clearTimeout(gravaDim); gravaDim = setTimeout(function () { guarda(DIM + slug, d); }, 2000); },
      aoSeguirLink: seguirLink,
      aoMontar: function () { if (ultimaPos) atualizaRodape(ultimaPos); }
    });

    var alvo = ao('rio');
    alvo.addEventListener('scroll', function () {
      rolando = true;
      clearTimeout(tempoRolagem);
      tempoRolagem = setTimeout(function () { rolando = false; aoMover(); }, 140);
      if (!aoMover.pendente) {
        aoMover.pendente = true;
        requestAnimationFrame(function () { aoMover.pendente = false; aoMover(); });
      }
    }, { passive: true });

    fazSumario().then(function () {
      var onde = lembra(POS + slug, null);
      ao('aviso').style.display = 'none';
      if (onde && onde.v === 3) return rio.vaiPara(onde);
      if (onde) return rio.vaiPara({ d: 0, b: 0, c: 0 });
    }).then(function () {
      desenhaMarcas();
      aoMover();
      requestAnimationFrame(function () { requestAnimationFrame(aoMover); });
      setTimeout(aoMover, 400);
      setTimeout(aoMover, 1200);
    });
  }
  var gravaDim = null;

  /* ------------------------------------------------------------------ sumario */
  function fazSumario() {
    var nav = pacote.navegacao();
    if (!nav) { desenhaSumario([]); return Promise.resolve(); }
    return pacote.textoDe(nav.caminho).then(function (t) {
      var itens = [];
      var doc = new DOMParser().parseFromString(t, t.indexOf('<ncx') >= 0 ? 'application/xml' : 'text/html');
      var pontos = doc.querySelectorAll('navPoint');
      if (pontos.length) {
        Array.prototype.forEach.call(pontos, function (np) {
          var rot = np.querySelector('navLabel text');
          var c = np.querySelector('content');
          if (rot && c) itens.push({ rotulo: (rot.textContent || '').trim(), href: c.getAttribute('src') || '' });
        });
      } else {
        // um sumario de verdade primeiro; a varredura de todo link so quando nao ha nav nenhum
        var navEl = doc.querySelector('nav[epub\\:type~="toc"], nav[*|type~="toc"], nav#toc, nav');
        var as = (navEl || doc).querySelectorAll('a[href]');
        Array.prototype.forEach.call(as, function (a) {
          if (itens.length >= 300) return;
          var h = a.getAttribute('href') || '';
          if (!h || h.charAt(0) === '#') return;
          var rot = (a.textContent || '').replace(/\s+/g, ' ').trim();
          if (!rot) return;
          itens.push({ rotulo: rot, href: h });
        });
      }
      var base = nav.caminho.indexOf('/') >= 0 ? nav.caminho.slice(0, nav.caminho.lastIndexOf('/')) : '';
      itens.forEach(function (it) {
        var alvo = AEV.Pacote.junta(base, decodeURIComponent(it.href.split('#')[0]));
        it.d = docs.findIndex(function (d) { return d.item.caminho === alvo; });
        it.ancora = it.href.indexOf('#') >= 0 ? it.href.split('#')[1] : '';
      });
      var vistos = {};
      sumario = itens.filter(function (i) {
        if (i.d < 0 || !i.rotulo) return false;
        var chave = i.d + '#' + i.ancora;
        if (vistos[chave]) return false;
        vistos[chave] = 1;
        return true;
      });
      desenhaSumario(sumario);
    }).catch(function (e) { window.AEV_ERRO_SUM = String(e && e.message || e); desenhaSumario([]); });
  }
  function desenhaSumario(itens) {
    var alvo = ao('toc');
    alvo.innerHTML = '';
    if (!itens.length) {
      var li = document.createElement('li');
      li.className = 'aev-vazio-nota';
      li.textContent = 'Este livro não traz sumário.';
      alvo.appendChild(li);
      return;
    }
    itens.forEach(function (it) {
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = '#'; a.textContent = it.rotulo;
      a.addEventListener('click', function (e) {
        e.preventDefault();
        if (ultimaPos) pilha.push(ultimaPos);
        rio.vaiPara({ d: it.d, b: 0, c: 0 }).then(function () {
          if (it.ancora) pulaAncora(it.d, it.ancora);
        });
        fecha();
      });
      li.appendChild(a); alvo.appendChild(li);
    });
  }
  function pulaAncora(d, id) {
    var caixa = rio.caixaDe(d);
    if (!caixa) return;
    var el = caixa.querySelector('#' + (window.CSS && CSS.escape ? CSS.escape(id) : id));
    if (!el) return;
    var bloco = el.closest('[data-b]') || el;
    ao('rio').scrollTop += bloco.getBoundingClientRect().top - ao('rio').getBoundingClientRect().top - 60;
  }
  function seguirLink(href, dOrigem) {
    var item = docs[dOrigem] && docs[dOrigem].item;
    if (!item) return;
    var base = item.caminho.indexOf('/') >= 0 ? item.caminho.slice(0, item.caminho.lastIndexOf('/')) : '';
    var semAncora = href.split('#')[0];
    var ancora = href.indexOf('#') >= 0 ? href.split('#')[1] : '';
    var alvoCaminho = semAncora ? AEV.Pacote.junta(base, decodeURIComponent(semAncora)) : item.caminho;
    var d = docs.findIndex(function (x) { return x.item.caminho === alvoCaminho; });
    if (d < 0) return;
    if (ultimaPos) pilha.push(ultimaPos);
    rio.vaiPara({ d: d, b: 0, c: 0 }).then(function () { if (ancora) pulaAncora(d, ancora); });
    mostraVolta();
  }
  function mostraVolta() {
    var b = ao('b-volta');
    if (b) b.hidden = pilha.length === 0;
  }
  var bv = ao('b-volta');
  if (bv) bv.addEventListener('click', function () {
    var loc = pilha.pop();
    if (loc) rio.vaiPara(loc);
    mostraVolta();
  });

  /* ------------------------------------------------------------------ busca */
  var tempoBusca = null;
  ao('q').addEventListener('input', function () {
    clearTimeout(tempoBusca);
    var termo = ao('q').value.trim();
    if (termo.length < 3) { ao('achados').innerHTML = ''; ao('q-conta').textContent = ''; return; }
    ao('q-conta').textContent = 'procurando';
    tempoBusca = setTimeout(function () { procura(termo); }, 280);
  });
  function dobra(s) {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }
  function procura(termo) {
    var alvo = dobra(termo);
    var achados = [];
    var fila = docs.map(function (d, i) {
      return function () {
        return pacote.textoDe(d.item.caminho).then(function (t) {
          var texto = t.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
          var plano = dobra(texto);
          var de = 0, k;
          while ((k = plano.indexOf(alvo, de)) >= 0 && achados.length < 300) {
            achados.push({ d: i, c: k, trecho: texto.slice(Math.max(0, k - 40), k + alvo.length + 60).trim() });
            de = k + alvo.length;
          }
        }).catch(function () {});
      };
    });
    var seq = Promise.resolve();
    fila.forEach(function (f) { seq = seq.then(f); });
    seq.then(function () {
      ao('q-conta').textContent = achados.length
        ? achados.length + (achados.length === 1 ? ' passagem' : ' passagens')
        : 'nada encontrado';
      var lista = ao('achados');
      lista.innerHTML = '';
      achados.slice(0, 200).forEach(function (r) {
        var li = document.createElement('li'), b = document.createElement('button');
        b.textContent = r.trecho;
        b.addEventListener('click', function () {
          if (ultimaPos) pilha.push(ultimaPos);
          rio.monta(r.d).then(function () {
            var caixa = rio.caixaDe(r.d);
            var blocos = caixa.querySelectorAll('[data-b]');
            var alvoBloco = blocos[0];
            for (var i = 0; i < blocos.length; i++) {
              if ((+blocos[i].getAttribute('data-c') || 0) <= r.c) alvoBloco = blocos[i];
              else break;
            }
            rio.vaiPara({ d: r.d, b: +alvoBloco.getAttribute('data-b'), c: Math.max(0, r.c - (+alvoBloco.getAttribute('data-c') || 0)) });
          });
          fecha();
          mostraVolta();
        });
        li.appendChild(b); lista.appendChild(li);
      });
    });
  }

  /* ------------------------------------------------------------------ teclado e setas */
  function passo(quanto) {
    var el = ao('rio');
    el.scrollBy({ top: quanto * (el.clientHeight - 64), behavior: 'smooth' });
  }
  ao('prox').addEventListener('click', function () { passo(1); });
  ao('ant').addEventListener('click', function () { passo(-1); });
  document.addEventListener('keydown', function (e) {
    if (/INPUT|TEXTAREA/.test((e.target.tagName || ''))) return;
    var k = e.key;
    if (k === 'ArrowRight' || k === 'PageDown' || k === ' ') { e.preventDefault(); passo(1); }
    else if (k === 'ArrowLeft' || k === 'PageUp') { e.preventDefault(); passo(-1); }
    else if (k === 'ArrowDown') { ao('rio').scrollBy({ top: 90 }); }
    else if (k === 'ArrowUp') { ao('rio').scrollBy({ top: -90 }); }
    else if (k === 'Home') { ao('rio').scrollTop = 0; }
    else if (k === 'Escape') fecha();
  });
  window.addEventListener('pagehide', function () { if (ultimaPos) guarda(POS + slug, ultimaPos); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden' && ultimaPos) guarda(POS + slug, ultimaPos);
  });
  window.AEV_LEITOR = { get rio() { return rio; }, get pacote() { return pacote; }, get pos() { return ultimaPos; } };
})();
