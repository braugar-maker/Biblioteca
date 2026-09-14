/* Instituto Aeviternitas · leitor da Biblioteca Aevum · o rio · 14/09/2026.
   Monta os capitulos numa rolagem continua, com altura medida em vez de estimada assim que o
   capitulo aparece uma vez, para que nada pule debaixo dos olhos de quem le.
   A posicao de leitura sai de teste de acerto na tela, nunca de tabela de topos. */
window.AEV = window.AEV || {};

AEV.Rio = (function () {
  'use strict';

  var LETRAS_POR_FATIA = 90000;   // acima disso o capitulo entra em lajes (Mallarme tem 1,5 MB num arquivo so)
  var PX_POR_LETRA = 0.62;        // estimativa inicial de altura; some assim que houver medida
  var MARGEM = '150% 0px 200% 0px';

  function cria(pai, dados, ctx) {
    var rio = pai;
    var modo = 'rolagem';       // 'rolagem' ou 'pagina'
    var pagina = 0, dAtual = 0, larguraPag = 0, folgaPag = 0, totalPag = 1;
    rio.innerHTML = '';
    rio.classList.add('aev-rio');

    var docs = dados.map(function (d, i) {
      var cx = document.createElement('section');
      cx.className = 'aev-cap';
      cx.setAttribute('data-d', String(i));
      cx.style.minHeight = Math.max(240, Math.round(d.letras * PX_POR_LETRA)) + 'px';
      rio.appendChild(cx);
      return { i: i, item: d.item, letras: d.letras, antes: d.antes, caixa: cx,
               montado: false, alturaMedida: 0, lajes: null };
    });

    var observador = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (e) {
        var i = +e.target.getAttribute('data-d');
        if (e.isIntersecting) monta(i);
      });
    }, { root: rio, rootMargin: MARGEM });
    docs.forEach(function (d) { observador.observe(d.caixa); });

    var dims = ctx.dimensoes || {};
    var emCurso = {};

    function monta(i) {
      var d = docs[i];
      if (!d || d.montado || emCurso[i]) return Promise.resolve();
      emCurso[i] = true;
      return ctx.corpoDe(d.item).then(function (limpo) {
        if (d.montado) return;
        var acimaDaVista = d.caixa.getBoundingClientRect().bottom < 0;
        var antes = d.caixa.offsetHeight;

        var raiz = limpo.raiz;
        raiz.setAttribute('data-d', String(i));
        d.caixa.innerHTML = '';
        d.caixa.appendChild(raiz);
        d.caixa.style.minHeight = '';
        d.montado = true;
        d.via = limpo.via;
        d.blocos = limpo.blocos;

        ligaImagens(d, raiz);
        ligaLinks(raiz);

        if (modo === 'pagina') { arrumaFolha(d); }
        var depois = d.caixa.offsetHeight;
        d.alturaMedida = depois;
        // so mexe na rolagem quando o capitulo cresceu acima da vista, e nunca durante o gesto
        if (acimaDaVista && depois !== antes && !ctx.estaRolando()) {
          rio.scrollTop += (depois - antes);
        }
        if (ctx.aoMontar) ctx.aoMontar(i);
      }).catch(function (e) {
        d.caixa.innerHTML = '<p class="aev-falha">Não consegui abrir esta parte do livro.</p>';
        d.montado = true;
      }).then(function () { emCurso[i] = false; });
    }

    function ligaImagens(d, raiz) {
      var imgs = raiz.querySelectorAll('img[data-src], image[data-src]');
      Array.prototype.forEach.call(imgs, function (im) {
        var href = im.getAttribute('data-src');
        var caminho = ctx.resolve(d.item, href);
        var it = ctx.pacote.porCaminho(caminho);
        if (!it) { im.remove(); return; }
        var guardada = dims[caminho];
        if (guardada) im.style.aspectRatio = guardada.l + ' / ' + guardada.a;
        ctx.pacote.dimensoesDe(caminho, it.tipo).then(function (dm) {
          if (dm && dm.l && dm.a) {
            dims[caminho] = dm;
            im.style.aspectRatio = dm.l + ' / ' + dm.a;
            if (ctx.aoMedirImagem) ctx.aoMedirImagem(dims);
          }
          return ctx.pacote.urlDe(caminho, it.tipo);
        }).then(function (url) {
          if (im.tagName.toLowerCase() === 'img') im.setAttribute('src', url);
          else im.setAttribute('href', url);
        }).catch(function () { im.remove(); });
      });
    }

    function ligaLinks(raiz) {
      var as = raiz.querySelectorAll('a[data-href]');
      Array.prototype.forEach.call(as, function (a) {
        var h = a.getAttribute('data-href');
        if (/^[a-z]+:/i.test(h)) {
          a.setAttribute('href', h);
          a.setAttribute('target', '_blank');
          a.setAttribute('rel', 'noopener');
          return;
        }
        a.setAttribute('href', '#');
        a.addEventListener('click', function (ev) {
          ev.preventDefault();
          if (ctx.aoSeguirLink) ctx.aoSeguirLink(h, +raiz.getAttribute('data-d'));
        });
      });
    }

    /* ------------------------------------------------------ onde a pessoa esta lendo */
    function linhaDagua() {
      var r = rio.getBoundingClientRect();
      return { x: r.left + r.width * 0.5, y: r.top + Math.min(90, r.height * 0.18) };
    }

    function localiza() {
      var p = linhaDagua();
      var el = document.elementFromPoint(p.x, p.y);
      if (!el || !rio.contains(el)) return null;
      var bloco = el.closest ? el.closest('[data-b]') : null;
      if (!bloco) {
        var cap = el.closest ? el.closest('.aev-cap') : null;
        if (!cap) return null;
        bloco = cap.querySelector('[data-b]');
        if (!bloco) return null;
      }
      var capX = bloco.closest('.aev-cap');
      var d = +capX.getAttribute('data-d');
      var b = +bloco.getAttribute('data-b');
      var c = 0;
      var pos = null;
      if (document.caretPositionFromPoint) {
        pos = document.caretPositionFromPoint(p.x, p.y);
        if (pos && bloco.contains(pos.offsetNode)) c = deslocamento(bloco, pos.offsetNode, pos.offset);
      } else if (document.caretRangeFromPoint) {
        var r = document.caretRangeFromPoint(p.x, p.y);
        if (r && bloco.contains(r.startContainer)) c = deslocamento(bloco, r.startContainer, r.startOffset);
      }
      var texto = (bloco.textContent || '').replace(/\s+/g, ' ').trim();
      var letrasAntes = docs[d].antes + (+bloco.getAttribute('data-c') || 0) + c;
      return {
        v: 3, san: AEV.Limpa.VERSAO, via: docs[d].via || 'xml',
        d: d, b: b, c: c,
        txt: texto.slice(Math.max(0, c), Math.max(0, c) + 48),
        pct: ctx.letrasTotais ? Math.min(1, letrasAntes / ctx.letrasTotais) : 0,
        letras: letrasAntes,
        aprox: false
      };
    }

    function deslocamento(bloco, no, off) {
      var conta = 0, achou = false;
      (function anda(el) {
        if (achou) return;
        for (var i = 0; i < el.childNodes.length; i++) {
          var n = el.childNodes[i];
          if (n === no) { conta += off; achou = true; return; }
          if (n.nodeType === 3) conta += n.nodeValue.length;
          else if (n.nodeType === 1) { anda(n); if (achou) return; }
        }
      })(bloco);
      return achou ? conta : 0;
    }

    function pontoDoCaractere(bloco, c) {
      var restante = c, alvo = null, pos = 0;
      (function anda(el) {
        if (alvo) return;
        for (var i = 0; i < el.childNodes.length; i++) {
          var n = el.childNodes[i];
          if (n.nodeType === 3) {
            if (restante <= n.nodeValue.length) { alvo = n; pos = restante; return; }
            restante -= n.nodeValue.length;
          } else if (n.nodeType === 1) { anda(n); if (alvo) return; }
        }
      })(bloco);
      if (!alvo) return null;
      try {
        var r = document.createRange();
        r.setStart(alvo, Math.min(pos, alvo.nodeValue.length));
        r.setEnd(alvo, Math.min(pos + 1, alvo.nodeValue.length));
        var cx = r.getBoundingClientRect();
        if (cx && cx.height) return cx;
      } catch (e) {}
      return null;
    }

    function paginaDoBloco(bloco, doc, folha) {
      var antes = doc.style.transform;
      doc.style.transform = 'translateX(0px)';
      var r1 = bloco.getBoundingClientRect(), r0 = folha.getBoundingClientRect();
      var x = r1.left - r0.left;
      doc.style.transform = antes;
      return Math.max(0, Math.round(x / Math.max(1, larguraPag + folgaPag)));
    }

    function vaiPara(loc) {
      if (!loc) return Promise.resolve(false);
      var d = Math.max(0, Math.min(docs.length - 1, loc.d | 0));
      if (modo === 'pagina') {
        return vaiCapitulo(d, false).then(function () {
          var caixa = docs[d].caixa;
          var doc = caixa.querySelector('.aev-doc');
          var folha = caixa.querySelector('.aev-folha');
          var bloco = caixa.querySelector('[data-b="' + (loc.b | 0) + '"]');
          if (!doc || !folha || !bloco) return false;
          poePagina(paginaDoBloco(bloco, doc, folha));
          return true;
        });
      }
      return monta(d).then(function () {
        return new Promise(function (pronto) {
          requestAnimationFrame(function () {
            var caixa = docs[d].caixa;
            var bloco = caixa.querySelector('[data-b="' + (loc.b | 0) + '"]') ||
                        caixa.querySelector('[data-b]');
            if (!bloco) { rio.scrollTop = caixa.offsetTop; pronto(false); return; }
            var alvoY = bloco.getBoundingClientRect().top;
            var cx = loc.c ? pontoDoCaractere(bloco, loc.c) : null;
            if (cx) alvoY = cx.top;
            var p = linhaDagua();
            rio.scrollTop += (alvoY - p.y);
            pronto(true);
          });
        });
      });
    }

    function montaTudo() {
      return Promise.all(docs.map(function (_, i) { return monta(i); }));
    }

    /* ---------------------------------------------------------- leitor virtual, pagina a pagina */
    function arrumaFolha(d) {
      if (!d.montado) return;
      var doc = d.caixa.querySelector('.aev-doc');
      if (!doc) return;
      if (!doc.parentElement.classList.contains('aev-folha')) {
        var folha = document.createElement('div');
        folha.className = 'aev-folha';
        doc.parentNode.insertBefore(folha, doc);
        folha.appendChild(doc);
      }
    }

    function medePaginas() {
      var d = docs[dAtual];
      if (!d || !d.montado) { totalPag = 1; return; }
      var folha = d.caixa.querySelector('.aev-folha');
      var doc = d.caixa.querySelector('.aev-doc');
      if (!folha || !doc) { totalPag = 1; return; }
      larguraPag = folha.clientWidth;
      folgaPag = Math.round(parseFloat(getComputedStyle(doc).columnGap) || 0);
      if (!larguraPag) { totalPag = 1; return; }
      doc.style.columnWidth = larguraPag + 'px';
      var largo = doc.scrollWidth;
      totalPag = Math.max(1, Math.round((largo + folgaPag) / (larguraPag + folgaPag)));
      return totalPag;
    }

    function poePagina(n) {
      var d = docs[dAtual];
      if (!d || !d.montado) return;
      var doc = d.caixa.querySelector('.aev-doc');
      if (!doc) return;
      pagina = Math.max(0, Math.min(totalPag - 1, n | 0));
      doc.style.transform = 'translateX(' + (-pagina * (larguraPag + folgaPag)) + 'px)';
      if (ctx.aoVirar) ctx.aoVirar({ d: dAtual, pagina: pagina, total: totalPag });
    }

    function mostraSo(i) {
      docs.forEach(function (x, k) {
        x.caixa.style.display = (k === i) ? '' : 'none';
        if (k === i) { x.caixa.style.minHeight = ''; }
      });
    }

    function vaiCapitulo(i, fim) {
      i = Math.max(0, Math.min(docs.length - 1, i));
      dAtual = i;
      mostraSo(i);
      return monta(i).then(function () {
        arrumaFolha(docs[i]);
        return new Promise(function (pronto) {
          requestAnimationFrame(function () {
            medePaginas();
            poePagina(fim ? totalPag - 1 : 0);
            pronto();
          });
        });
      });
    }

    function vira(passo) {
      if (modo !== 'pagina') {
        rio.scrollBy({ top: passo * (rio.clientHeight - 64), behavior: 'smooth' });
        return Promise.resolve();
      }
      var n = pagina + passo;
      if (n >= 0 && n < totalPag) { poePagina(n); return Promise.resolve(); }
      if (n < 0) {
        if (dAtual === 0) { poePagina(0); return Promise.resolve(); }
        return vaiCapitulo(dAtual - 1, true);
      }
      if (dAtual >= docs.length - 1) { poePagina(totalPag - 1); return Promise.resolve(); }
      return vaiCapitulo(dAtual + 1, false);
    }

    function defineModo(m) {
      var onde = localiza();
      modo = (m === 'pagina') ? 'pagina' : 'rolagem';
      rio.classList.toggle('aev-pagina', modo === 'pagina');
      if (modo === 'pagina') {
        docs.forEach(function (d) { if (d.montado) arrumaFolha(d); });
        return vaiCapitulo(onde ? onde.d : dAtual, false).then(function () {
          if (onde) return vaiPara(onde);
        });
      }
      docs.forEach(function (d) {
        d.caixa.style.display = '';
        var doc = d.caixa.querySelector('.aev-doc');
        if (doc) doc.style.transform = '';
        if (!d.montado) d.caixa.style.minHeight = Math.max(240, Math.round(d.letras * PX_POR_LETRA)) + 'px';
      });
      if (onde) return vaiPara(onde);
      return Promise.resolve();
    }

    function remede() {
      if (modo !== 'pagina') return;
      var onde = localiza();
      medePaginas();
      if (onde) vaiPara(onde); else poePagina(pagina);
    }

    return {
      docs: docs, monta: monta, montaTudo: montaTudo,
      defineModo: defineModo, vira: vira, remede: remede,
      modo: function () { return modo; },
      paginaAtual: function () { return { pagina: pagina, total: totalPag, d: dAtual }; },
      localiza: localiza, vaiPara: vaiPara, rio: rio,
      caixaDe: function (i) { return docs[i] && docs[i].caixa; }
    };
  }

  return { cria: cria, LETRAS_POR_FATIA: LETRAS_POR_FATIA };
})();
