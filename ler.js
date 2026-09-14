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

  var GOSTO_PADRAO = { papel: 'escuro', corpo: 106, entre: 1.62, margem: 24,
                       letra: 'serif', medida: 26, modo: 'pagina' };
  // a coluna de 34em dava 87 caracteres por linha, doze acima do que se le sem cansar; os tres
  // degraus passaram a 22, 26 e 29em, que medem 56, 66 e 74. Quem ja escolheu, vem junto.
  var MEDIDA_NOVA = { 30: 22, 34: 26, 40: 29 };
  var VALORES = {
    papel: ['escuro', 'claro', 'sepia'], letra: ['serif', 'sans'], modo: ['pagina', 'rolagem'],
    corpo: [94, 106, 122, 144], entre: [1.45, 1.62, 1.88], margem: [18, 24, 40], medida: [22, 26, 29]
  };
  /* Registro guardado pela metade, de uma versao velha ou de uma aba que gravou so um campo,
     entrava direto nas variaveis do CSS e saia --medida:undefinedem, que o navegador descarta:
     a folha perdia a medida e o livro abria com a largura da janela. O gosto e conferido campo
     por campo contra o padrao antes de ir para a tela. */
  function saneia(g) {
    var bom = {}, k;
    g = (g && typeof g === 'object') ? g : {};
    if (MEDIDA_NOVA[g.medida]) g.medida = MEDIDA_NOVA[g.medida];
    for (k in GOSTO_PADRAO) {
      var v = g[k], aceitos = VALORES[k];
      bom[k] = (aceitos && aceitos.indexOf(v) >= 0) ? v : GOSTO_PADRAO[k];
    }
    return bom;
  }
  var gostoBruto = lembra(PREF, null);
  var gosto = saneia(gostoBruto);
  if (JSON.stringify(gosto) !== JSON.stringify(gostoBruto)) guarda(PREF, gosto);
  if (!gosto.modo) gosto.modo = 'pagina';
  var arq = param('arq');
  var slug = arq.split('/').pop().replace(/\.epub$/i, '');
  var pacote = null, rio = null, docs = [], letrasTotais = 0, sumario = [], pilha = [];
  var rolando = false, tempoRolagem = null, gravaTempo = null, ultimaPos = null;
  /* Restaurar a posicao passa pela pagina 0 antes de chegar ao lugar certo, e cada passagem
     agenda uma gravacao. Fechar a aba nesse intervalo selaria o comeco do capitulo como o
     lugar onde a pessoa parou. Enquanto isto estiver ligado, o rodape se atualiza e nada
     se grava. */
  var restaurando = 0;
  function semGravar(faz) {
    restaurando++;
    clearTimeout(gravaTempo);
    function solta(v) { restaurando = Math.max(0, restaurando - 1); return v; }
    var p;
    try { p = faz(); } catch (e) { solta(); throw e; }
    return Promise.resolve(p).then(solta, function (e) { solta(); throw e; });
  }

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
    // o vinco cresce com o texto, e nao com a margem da folha
    r.setProperty('--vinco', (gosto.medida * 0.13).toFixed(2) + 'em');
    r.setProperty('--letra', LETRAS[gosto.letra] || LETRAS.serif);
    marca('g-papel', 'papel', gosto.papel);
    marca('g-corpo', 'corpo', String(gosto.corpo));
    marca('g-entre', 'entre', String(gosto.entre));
    marca('g-margem', 'margem', String(gosto.margem));
    marca('g-letra', 'letra', gosto.letra);
    marca('g-medida', 'medida', String(gosto.medida));
    marca('g-modo', 'modo', gosto.modo);
  }
  function marca(id, chave, valor) {
    var g = ao(id);
    if (!g) return;
    Array.prototype.forEach.call(g.children, function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-' + chave) === valor ? 'true' : 'false');
    });
  }
  [['g-papel', 'papel', 's'], ['g-corpo', 'corpo', 'n'], ['g-entre', 'entre', 'f'],
   ['g-margem', 'margem', 'n'], ['g-letra', 'letra', 's'], ['g-medida', 'medida', 'n'],
   ['g-modo', 'modo', 's']]
    .forEach(function (par) {
      var g = ao(par[0]);
      if (!g) return;
      g.addEventListener('click', function (ev) {
        var b = ev.target.closest('[data-' + par[1] + ']');
        if (!b) return;
        var v = b.getAttribute('data-' + par[1]);
        gosto[par[1]] = par[2] === 'n' ? parseInt(v, 10) : (par[2] === 'f' ? parseFloat(v) : v);
        guarda(PREF, gosto);
        if (par[1] === 'modo') {
          pinta();
          if (rio) semGravar(function () { return rio.defineModo(gosto.modo); }).then(atualizaPe);
          return;
        }
        var antes = rio ? rio.localiza() : null;
        pinta();
        if (rio && rio.modo() === 'pagina') {
          requestAnimationFrame(function () { rio.remede(); atualizaPe(); });
          return;
        }
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
  function atualizaPe() {
    if (!rio || rio.modo() !== 'pagina') return;
    ao('pct').textContent = rotuloDaPagina(rio.paginaAtual());
    var loc = rio.localiza();
    if (loc) {
      if (!loc.aprox) ultimaPos = loc;
      ao('andado').style.width = ((loc.pct || 0) * 100).toFixed(1) + '%';
      nomeDoCapitulo(loc);
      acendeMarca();
      if (!restaurando && !loc.aprox) {
        clearTimeout(gravaTempo);
        gravaTempo = setTimeout(function () { guarda(POS + slug, loc); }, 900);
      }
    }
  }

  /* Com o livro aberto a folha traz duas paginas, e o rodape as nomeia como um livro as nomeia:
     "pág. 42 e 43 de 318". A conta de baixo e sempre de paginas, nunca de folhas. */
  function rotuloDaPagina(p) {
    var total = p.totalCol || p.total;
    if ((p.colunas || 1) < 2) return 'pág. ' + (p.pagina + 1) + ' de ' + total;
    var esq = p.pagina * 2 + 1, dir = Math.min(esq + 1, total);
    return 'pág. ' + esq + (dir > esq ? ' e ' + dir : '') + ' de ' + total;
  }

  function nomeDoCapitulo(loc) {
    var nome = '';
    for (var i = 0; i < sumario.length; i++) {
      if (sumario[i].d === loc.d) { nome = sumario[i].rotulo; break; }
      if (sumario[i].d > loc.d) break;
      nome = sumario[i].rotulo;
    }
    ao('cap').textContent = nome.length > 46 ? nome.slice(0, 44).trim() + '...' : nome;
  }

  function atualizaRodape(loc) {
    if (!loc) return;
    if (rio && rio.modo() === 'pagina') { atualizaPe(); return; }
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
    if (!loc.aprox) ultimaPos = loc;
    atualizaRodape(loc);
    acendeMarca();
    if (!restaurando && !loc.aprox) {
      clearTimeout(gravaTempo);
      gravaTempo = setTimeout(function () { guarda(POS + slug, loc); }, 1200);
    }
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
      // 155 das 255 obras nao sao em portugues e corriam com o dicionario de hifenizacao
      // errado; a lingua sai da propria ficha do EPUB
      idioma: (pacote.meta && pacote.meta.language) || 'pt-BR',
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
      aoMontar: function () { if (ultimaPos) atualizaRodape(ultimaPos); },
      aoVirar: function () { setTimeout(atualizaPe, 60); }
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
      return semGravar(function () {
        return Promise.resolve(gosto.modo === 'pagina' ? rio.defineModo('pagina') : null)
          .then(function () {
            var onde = lembra(POS + slug, null);
            ao('aviso').style.display = 'none';
            if (onde && onde.v === 3) return rio.vaiPara(onde);
            if (onde) return rio.vaiPara({ d: 0, b: 0, c: 0 });
            // quem abre o livro pela primeira vez cai na primeira pagina que tem o que mostrar:
            // muitos EPUB comecam pelo nav.xhtml, que fica sem nada depois da limpeza
            var marca = rio.gesto();
            return rio.achaCheio(0, 1).then(function (k) {
              if (rio.gesto() !== marca) return;   // a pessoa ja virou a pagina: nao a puxe de volta
              if (k > 0) return rio.vaiPara({ d: k, b: 0, c: 0 });
            });
          });
      });
    }).then(function () {
      desenhaMarcas();
      aoMover();
      atualizaPe();
      requestAnimationFrame(function () { requestAnimationFrame(function () { aoMover(); atualizaPe(); }); });
      setTimeout(function () { aoMover(); atualizaPe(); }, 400);
      setTimeout(function () { aoMover(); atualizaPe(); }, 1200);
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
    // gesto de virar: sai com folha. Salto de sumario, de busca ou de marcador troca a seco,
    // porque quem salta de capitulo nao esta virando uma folha.
    if (rio) { rio.viraFolha(quanto); setTimeout(atualizaPe, 220); setTimeout(atualizaPe, 400); return; }
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
  window.addEventListener('pagehide', function () { if (ultimaPos && !restaurando) guarda(POS + slug, ultimaPos); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden' && ultimaPos && !restaurando) guarda(POS + slug, ultimaPos);
  });
  window.AEV_LEITOR = { get rio() { return rio; }, get pacote() { return pacote; }, get pos() { return ultimaPos; } };
})();
