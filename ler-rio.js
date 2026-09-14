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
    var pagina = 0, dAtual = 0, larguraPag = 0, alturaPag = 0, folgaPag = 0, totalPag = 1;
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
      if (!d || d.montado) return Promise.resolve();
      // devolver uma promessa ja resolvida aqui faria o modo de pagina medir um capitulo
      // que ainda nao existe, e o rodape diria "pag. 1 de 1" num capitulo de dez paginas
      if (emCurso[i]) return emCurso[i];
      var emVoo = ctx.corpoDe(d.item).then(function (limpo) {
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
        // paginas de servico do EPUB, como o nav.xhtml, ficam sem nada depois da limpeza;
        // o leitor nao pode abrir num documento que nao tem o que mostrar
        d.vazio = !(raiz.textContent || '').replace(/\s+/g, '').length &&
                  !raiz.querySelector('img, svg, image');

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
      }).then(function () { emCurso[i] = null; });
      emCurso[i] = emVoo;
      return emVoo;
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
        }).catch(function () { im.remove(); if (modo === 'pagina') agendaReancora(); });
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
    /* A ancora e o bloco que estava a vista no ultimo movimento deliberado. Serve para voltar
       ao mesmo lugar quando a pagina e remedida, e para nao gravar o comeco do capitulo quando
       a linha d'agua pousa em branco, o que acontece em pagina de figura inteira. */
    var ancora = null, tempoAncora = null;

    function lembraAncora() {
      if (modo !== 'pagina') return;
      var d = docs[dAtual];
      if (!d || !d.montado) return;
      var folha = d.caixa.querySelector('.aev-folha');
      if (!folha) return;
      var r = folha.getBoundingClientRect();
      var pontos = [[r.left + r.width * 0.5, r.top + 26],
                    [r.left + r.width * 0.5, r.top + r.height * 0.5],
                    [r.left + r.width * 0.3, r.top + r.height * 0.85]];
      for (var i = 0; i < pontos.length; i++) {
        var el = document.elementFromPoint(pontos[i][0], pontos[i][1]);
        var bl = (el && el.closest) ? el.closest('[data-b]') : null;
        if (bl && d.caixa.contains(bl)) {
          var c = 0;
          if (document.caretPositionFromPoint) {
            var cp = document.caretPositionFromPoint(pontos[i][0], pontos[i][1]);
            if (cp && bl.contains(cp.offsetNode)) c = deslocamento(bl, cp.offsetNode, cp.offset);
          } else if (document.caretRangeFromPoint) {
            var cr = document.caretRangeFromPoint(pontos[i][0], pontos[i][1]);
            if (cr && bl.contains(cr.startContainer)) c = deslocamento(bl, cr.startContainer, cr.startOffset);
          }
          ancora = { d: dAtual, b: +bl.getAttribute('data-b'), c: c };
          return;
        }
      }
    }

    function agendaAncora() {
      clearTimeout(tempoAncora);
      tempoAncora = setTimeout(lembraAncora, 230);   // depois de a virada assentar
    }

    function linhaDagua() {
      var r = rio.getBoundingClientRect();
      return { x: r.left + r.width * 0.5, y: r.top + Math.min(90, r.height * 0.18) };
    }

    function localiza() {
      var p = linhaDagua();
      var el = document.elementFromPoint(p.x, p.y);
      if (!el || !rio.contains(el)) return null;
      var bloco = el.closest ? el.closest('[data-b]') : null;
      var deRecuo = false;
      if (!bloco) {
        var cap = el.closest ? el.closest('.aev-cap') : null;
        if (!cap) return null;
        if (modo === 'pagina') {
          // no modo de pagina o capitulo cobre o rio inteiro, entao a linha d'agua sempre acha
          // alguma coisa; quando nao acha bloco, o primeiro do capitulo seria uma mentira que
          // ainda por cima se grava. Prefiro a ancora, e na falta dela nao dizer nada.
          var cd = +cap.getAttribute('data-d');
          bloco = (ancora && ancora.d === cd) ? cap.querySelector('[data-b="' + ancora.b + '"]') : null;
          if (!bloco) return null;
          // a ancora e o bloco do ultimo movimento deliberado: isso nao e chute
        } else {
          bloco = cap.querySelector('[data-b]');
          deRecuo = true;
        }
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
      // No modo de pagina guardo tambem o numero da pagina e a geometria em que ele foi contado.
      // Quando o livro reabre na mesma janela, com a mesma letra e a mesma margem, isso devolve
      // a pagina exata; quando a geometria mudou, o numero e descartado e vale o ponto do texto.
      var daPagina = (modo === 'pagina') ? {
        pag: pagina, larg: Math.round(larguraPag), alt: Math.round(alturaPag), tot: totalPag
      } : null;
      return {
        v: 3, san: AEV.Limpa.VERSAO, via: docs[d].via || 'xml',
        d: d, b: b, c: c,
        pag: daPagina ? daPagina.pag : undefined,
        larg: daPagina ? daPagina.larg : undefined,
        alt: daPagina ? daPagina.alt : undefined,
        tot: daPagina ? daPagina.tot : undefined,
        txt: texto.slice(Math.max(0, c), Math.max(0, c) + 48),
        pct: ctx.letrasTotais ? Math.min(1, letrasAntes / ctx.letrasTotais) : 0,
        letras: letrasAntes,
        aprox: deRecuo
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

    /* A origem das colunas e a caixa de .aev-doc, nunca a folha: a folha carrega o recuo lateral
       junto e a conta sairia deslocada de uma margem inteira. E a conta sai do ponto do caractere,
       nao do canto do paragrafo: um paragrafo que atravessa a virada comeca na pagina anterior, e
       quem medisse pelo canto puxaria a leitura uma pagina para tras a cada remedida. */
    function paginaDoPonto(bloco, c, doc) {
      var transicao = doc.style.transition, antes = doc.style.transform;
      doc.style.transition = 'none';
      doc.style.transform = 'translateX(0px)';
      var base = doc.getBoundingClientRect().left;
      var ponto = c ? pontoDoCaractere(bloco, c) : null;
      var x = (ponto ? ponto.left : bloco.getBoundingClientRect().left) - base;
      doc.style.transform = antes;
      void doc.offsetWidth;
      doc.style.transition = transicao;
      return Math.max(0, Math.floor((x + 0.5) / Math.max(1, larguraPag + folgaPag)));
    }

    function paginaDoBloco(bloco, doc) { return paginaDoPonto(bloco, 0, doc); }

    function vaiPara(loc) {
      if (!loc) return Promise.resolve(false);
      var d = Math.max(0, Math.min(docs.length - 1, loc.d | 0));
      if (modo === 'pagina') {
        return vaiCapitulo(d, false).then(function () {
          var caixa = docs[dAtual].caixa;
          var doc = caixa.querySelector('.aev-doc');
          var folha = caixa.querySelector('.aev-folha');
          if (!doc || !folha) return false;
          // geometria igual a de quando se parou de ler: a pagina guardada vale ao pe da letra
          if (typeof loc.pag === 'number' && loc.tot === totalPag &&
              loc.larg === Math.round(larguraPag) && loc.alt === Math.round(alturaPag)) {
            poePagina(loc.pag);
            return true;
          }
          var bloco = caixa.querySelector('[data-b="' + (loc.b | 0) + '"]') ||
                      caixa.querySelector('[data-b]');
          if (!bloco) return false;
          poePagina(paginaDoPonto(bloco, loc.c | 0, doc));
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
      if (vigiaTamanho) vigiaTamanho.observe(doc);
    }

    /* Aba em segundo plano nao recebe quadro nenhum: quem esperasse so por requestAnimationFrame
       ficaria parado para sempre, sem colunas e sem pagina. O relogio corre atras como fiador. */
    function proximoQuadro(fn) {
      var feito = false;
      function uma() { if (feito) return; feito = true; fn(); }
      requestAnimationFrame(uma);
      setTimeout(uma, 80);
    }

    function achaCheio(i, passo) {
      var n = docs.length, k = Math.max(0, Math.min(n - 1, i)), tentativas = 0;
      function tenta() {
        if (k < 0 || k >= n || tentativas > 16) return Promise.resolve(-1);
        return monta(k).then(function () {
          if (!docs[k] || !docs[k].vazio) return k;
          k += passo; tentativas++;
          return tenta();
        });
      }
      return tenta();
    }

    function medePaginas() {
      var d = docs[dAtual];
      if (!d || !d.montado) { totalPag = 1; return 1; }
      var folha = d.caixa.querySelector('.aev-folha');
      var doc = d.caixa.querySelector('.aev-doc');
      if (!folha || !doc) { totalPag = 1; return 1; }
      // sem arredondar: o subpixel aqui entra multiplicado pelo numero da pagina la na frente
      folgaPag = parseFloat(getComputedStyle(doc).columnGap) || 0;
      // a coluna mede a caixa de conteudo de .aev-doc. Medir a folha traria o recuo lateral
      // junto, o passo da virada sairia maior que a coluna e a pagina andaria de lado.
      larguraPag = doc.getBoundingClientRect().width || doc.clientWidth;
      if (!larguraPag) { totalPag = 1; return 1; }
      doc.style.columnWidth = larguraPag + 'px';
      // a altura util vai em pixel para a folha de estilo: percentagem de altura nao resolve
      // dentro de um bloco de altura automatica, e por isso a capa transbordava a coluna.
      // a altura util e a da caixa de conteudo de .aev-doc, ja descontado o recuo de baixo
      // que a barra da Radio aberta acrescenta a folha.
      alturaPag = doc.clientHeight;
      rio.style.setProperty('--alt-pag', alturaPag + 'px');
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
      doc.style.transform = 'translateX(' + Math.round(-pagina * (larguraPag + folgaPag)) + 'px)';
      agendaAncora();
      if (ctx.aoVirar) ctx.aoVirar({ d: dAtual, pagina: pagina, total: totalPag });
    }

    function mostraSo(i) {
      docs.forEach(function (x, k) {
        x.caixa.style.display = (k === i) ? '' : 'none';
        if (k === i) { x.caixa.style.minHeight = ''; }
      });
    }

    function vaiCapitulo(i, fim) {
      var passo = fim ? -1 : 1;
      return achaCheio(Math.max(0, Math.min(docs.length - 1, i)), passo).then(function (k) {
        if (k < 0) { poePagina(fim ? 0 : totalPag - 1); return dAtual; }
        dAtual = k;
        mostraSo(k);
        arrumaFolha(docs[k]);
        return new Promise(function (pronto) {
          proximoQuadro(function () {
            medePaginas();
            poePagina(fim ? totalPag - 1 : 0);
            // a primeira medida sai antes de a folha assentar; a segunda confere logo depois
            proximoQuadro(function () {
              var antes = totalPag;
              medePaginas();
              if (totalPag !== antes) poePagina(fim ? totalPag - 1 : pagina);
            });
            pronto(k);
          });
        });
      });
    }

    /* A folha muda de tamanho sem que a janela mude: a barra da Radio abre e come o rodape,
       o painel de ajustes altera a margem. Quando isso acontece, a pagina e remedida. */
    var vigiaTamanho = (typeof ResizeObserver === 'function') ? new ResizeObserver(function () {
      if (modo !== 'pagina') return;
      var d = docs[dAtual];
      if (!d || !d.montado) return;
      var doc = d.caixa.querySelector('.aev-doc');
      if (!doc) return;
      if (doc.clientWidth === larguraPag && doc.clientHeight === alturaPag) return;
      agendaReancora();
    }) : null;

    var reancoraMarcada = false;
    function agendaReancora() {
      if (reancoraMarcada) return;
      reancoraMarcada = true;
      proximoQuadro(function () { reancoraMarcada = false; reancora(); });
    }

    function reancora() {
      if (modo !== 'pagina') return;
      var d = docs[dAtual];
      if (!d || !d.montado) return;
      var doc = d.caixa.querySelector('.aev-doc');
      if (!doc) return;
      var alvo = (ancora && ancora.d === dAtual) ? ancora : null;
      if (!alvo) {
        var onde = localiza();
        if (onde && onde.d === dAtual && !onde.aprox) alvo = onde;
      }
      medePaginas();
      var bloco = alvo ? d.caixa.querySelector('[data-b="' + (alvo.b | 0) + '"]') : null;
      if (bloco) poePagina(paginaDoPonto(bloco, alvo.c | 0, doc));
      else poePagina(pagina);
    }

    /* Uma figura so ocupa lugar depois de carregada, e o zip entrega a imagem bem depois de o
       capitulo estar montado. Quem mediu antes disso viu uma pagina onde havia tres, e a pagina
       ficava em branco. Por isso cada figura que chega pede nova medida, e a leitura volta para
       o mesmo bloco de texto. O evento load nao borbulha, mas passa pela fase de captura. */
    rio.addEventListener('load', function (ev) {
      var alvo = ev.target;
      if (modo !== 'pagina' || !alvo) return;
      var cap = alvo.closest ? alvo.closest('.aev-cap') : null;
      if (!cap || +cap.getAttribute('data-d') !== dAtual) return;
      agendaReancora();
    }, true);

    if (document.fonts) {
      // cada leva de fontes que chega muda a medida do texto, e com ela a conta das paginas
      if (document.fonts.addEventListener) {
        document.fonts.addEventListener('loadingdone', function () {
          if (modo === 'pagina') agendaReancora();
        });
      } else if (document.fonts.ready) {
        document.fonts.ready.then(function () { if (modo === 'pagina') agendaReancora(); });
      }
    }

    // ao voltar para a aba, confere a conta: o navegador pode ter adiado tudo enquanto ela dormia
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && modo === 'pagina') agendaReancora();
    });

    function vira(passo) {
      if (modo !== 'pagina') {
        rio.scrollBy({ top: passo * (rio.clientHeight - 64), behavior: 'smooth' });
        return Promise.resolve();
      }
      medePaginas();
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
        if (doc) { doc.style.transform = ''; doc.style.columnWidth = ''; }
        if (!d.montado) d.caixa.style.minHeight = Math.max(240, Math.round(d.letras * PX_POR_LETRA)) + 'px';
      });
      if (onde) return vaiPara(onde);
      return Promise.resolve();
    }

    function remede() {
      if (modo !== 'pagina') return;
      reancora();
    }

    return {
      docs: docs, monta: monta, montaTudo: montaTudo,
      defineModo: defineModo, vira: vira, remede: remede,
      modo: function () { return modo; },
      paginaAtual: function () { return { pagina: pagina, total: totalPag, d: dAtual }; },
      localiza: localiza, vaiPara: vaiPara, rio: rio, achaCheio: achaCheio,
      caixaDe: function (i) { return docs[i] && docs[i].caixa; }
    };
  }

  return { cria: cria, LETRAS_POR_FATIA: LETRAS_POR_FATIA };
})();
