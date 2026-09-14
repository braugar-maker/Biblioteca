/* Instituto Aeviternitas · leitor da Biblioteca Aevum · a limpeza · 14/09/2026.
   Recebe o XHTML de um capitulo e devolve blocos prontos para o rio: sem script, sem folha do
   EPUB, com a tipografia que morava em classe traduzida para os tokens do instituto.
   A tabela nasceu da varredura dos 255 livros do acervo (dev/classes-acervo.json). */
window.AEV = window.AEV || {};

AEV.Limpa = (function () {
  'use strict';

  var VERSAO = 1;

  /* classes do acervo -> tokens do instituto. Numeros medidos em dev/classes-acervo.json */
  var CLASSES = {
    // numeracao de pagina do original e encanamento do Wikisource: some
    'pagenum': 'aev-oculto', 'ws-pagenum': 'aev-oculto', 'x-ebookmaker-pageno': 'aev-oculto',
    'stpagenum': 'aev-oculto', 'pageNum': 'aev-oculto', 'pagenumber': 'aev-oculto',
    'linenum': 'aev-oculto', 'pn': 'aev-oculto', 'mw-empty-elt': 'aev-oculto',
    'mw-linkback-text': 'aev-oculto', 'mw-cite-backlink': 'aev-oculto', 'wst-gap': 'aev-oculto',
    'mw-editsection': 'aev-oculto', 'mw-editsection-bracket': 'aev-oculto',
    'mw-editsection-divider': 'aev-oculto', 'editsection': 'aev-oculto',
    'noprint': 'aev-oculto', 'metadata': 'aev-oculto', 'navbox': 'aev-oculto',
    'ws-noexport': 'aev-oculto', 'nomobile': 'aev-oculto',
    // verso
    'poem': 'aev-verso', 'verse': 'aev-verso', 'lg': 'aev-verso', 'poetry': 'aev-verso',
    'stanza': 'aev-estrofe', 'strophe': 'aev-estrofe',
    'i0': 'aev-v0', 'i1': 'aev-v1', 'i2': 'aev-v2', 'i3': 'aev-v3', 'i4': 'aev-v4',
    'hang': 'aev-pendente', 'wst-hanging-indent': 'aev-pendente', 'tiInherit': 'aev-pendente',
    // versalete e caixa
    'smcap': 'aev-versalete', 'sc': 'aev-versalete', 'small-caps': 'aev-versalete',
    'lowercase': 'aev-minuscula', 'gesperrt': 'aev-espacado', 'antiqua': 'aev-espacado',
    // paragrafo
    'noindent': 'aev-sem-recuo', 'nind': 'aev-sem-recuo', 'primeiro': 'aev-sem-recuo',
    'first': 'aev-sem-recuo', 'p2': 'aev-sem-recuo', 'nop': 'aev-sem-recuo',
    // alinhamento
    'center': 'aev-centro', 'centered': 'aev-centro', 'figcenter': 'aev-centro',
    'right': 'aev-direita', 'align-right': 'aev-direita', 'signature': 'aev-direita',
    // citacao
    'blockquot': 'aev-citacao', 'blockquote': 'aev-citacao', 'quote': 'aev-citacao',
    'extract': 'aev-citacao', 'epigraph': 'aev-citacao',
    // nota
    'footnote': 'aev-nota', 'foot': 'aev-nota', 'footnotes': 'aev-nota',
    'sidenote': 'aev-nota', 'mw-reference-text': 'aev-nota', 'reference-text': 'aev-nota',
    'fnanchor': 'aev-chamada', 'label': 'aev-chamada', 'cite-bracket': 'aev-chamada',
    'mw-reflink-text': 'aev-chamada', 'mw-ref': 'aev-chamada',
    // legenda e sumario
    'caption': 'aev-legenda', 'figcaption': 'aev-legenda',
    'toc': 'aev-sumario', 'tableItem': 'aev-sumario', 'contents': 'aev-sumario',
    // teatro
    'drama': 'aev-fala', 'charname': 'aev-personagem', 'iname': 'aev-personagem',
    'speaker': 'aev-personagem'
  };

  var PROIBIDAS = { SCRIPT: 1, STYLE: 1, LINK: 1, META: 1, BASE: 1, IFRAME: 1, OBJECT: 1,
                    EMBED: 1, FORM: 1, INPUT: 1, BUTTON: 1, AUDIO: 1, VIDEO: 1, CANVAS: 1 };

  /* atributos de estilo que podem passar: so estrutura tipografica, nunca cor nem medida em px */
  var ESTILO_OK = { 'font-style': 1, 'font-variant': 1, 'text-align': 1, 'vertical-align': 1,
                    'font-weight': 1, 'text-decoration': 1 };

  function limpaEstilo(v) {
    var fora = [];
    String(v || '').split(';').forEach(function (par) {
      var i = par.indexOf(':');
      if (i < 0) return;
      var p = par.slice(0, i).trim().toLowerCase();
      var val = par.slice(i + 1).trim();
      if (!ESTILO_OK[p]) return;
      if (/url\s*\(|expression|[0-9]+px/i.test(val)) return;
      fora.push(p + ':' + val);
    });
    return fora.join(';');
  }

  function traduz(classe) {
    var saida = [];
    String(classe || '').split(/\s+/).forEach(function (c) {
      if (!c) return;
      var t = CLASSES[c];
      if (t) { if (saida.indexOf(t) < 0) saida.push(t); return; }
      var m = /^(?:i|in|indent)(\d)$/.exec(c);
      if (m) { saida.push('aev-v' + Math.min(4, +m[1])); return; }
    });
    return saida.join(' ');
  }

  /* tres degraus de leitura: XML, XML com entidades soltas resolvidas, e por fim HTML */
  function leDocumento(txt) {
    var dp = new DOMParser();
    var d = dp.parseFromString(txt, 'application/xhtml+xml');
    if (!d.querySelector('parsererror')) return { doc: d, via: 'xml' };
    var solto = txt.replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)([a-zA-Z][a-zA-Z0-9]{1,31});/g,
      function (_, nome) {
        var t = document.createElement('textarea');
        t.innerHTML = '&' + nome + ';';
        var v = t.value;
        return v === '&' + nome + ';' ? '' : v;
      });
    d = dp.parseFromString(solto, 'application/xhtml+xml');
    if (!d.querySelector('parsererror')) return { doc: d, via: 'entidades' };
    return { doc: dp.parseFromString(txt, 'text/html'), via: 'html' };
  }

  var BLOCOS = { P: 1, DIV: 1, H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1, BLOCKQUOTE: 1,
                 UL: 1, OL: 1, DL: 1, TABLE: 1, PRE: 1, FIGURE: 1, HR: 1, SECTION: 1,
                 ARTICLE: 1, ASIDE: 1, LI: 1 };

  /** limpa(txt, ctx) -> {via, raiz, blocos:[{el, letras, inicio}], letras}
      ctx: {resolve(href) -> caminho absoluto no zip} */
  function limpa(txt, ctx) {
    var lido = leDocumento(txt);
    var doc = lido.doc;
    var corpo = doc.body || doc.getElementsByTagName('body')[0];
    if (!corpo) return { via: lido.via, raiz: document.createElement('div'), blocos: [], letras: 0 };

    var raiz = document.createElement('div');
    raiz.className = 'aev-doc';

    (function anda(de, para) {
      var n = de.firstChild;
      while (n) {
        var prox = n.nextSibling;
        if (n.nodeType === 3) {
          para.appendChild(document.createTextNode(n.nodeValue));
        } else if (n.nodeType === 1) {
          var tag = n.tagName.toUpperCase();
          if (PROIBIDAS[tag]) { n = prox; continue; }
          var novo = document.createElement(tag === 'BODY' ? 'DIV' : tag);
          for (var i = 0; i < n.attributes.length; i++) {
            var at = n.attributes[i], nome = at.name.toLowerCase();
            if (nome.indexOf('on') === 0) continue;
            if (nome === 'class') {
              var t = traduz(at.value);
              if (t) novo.setAttribute('class', t);
              continue;
            }
            if (nome === 'style') {
              var e = limpaEstilo(at.value);
              if (e) novo.setAttribute('style', e);
              continue;
            }
            if (nome === 'src' || nome === 'href' || nome === 'xlink:href') {
              novo.setAttribute('data-' + (nome === 'href' ? 'href' : 'src'), at.value);
              continue;
            }
            if (nome === 'id' || nome === 'alt' || nome === 'title' || nome === 'colspan' ||
                nome === 'rowspan' || nome === 'width' || nome === 'height' || nome === 'lang') {
              novo.setAttribute(nome, at.value);
            }
          }
          para.appendChild(novo);
          anda(n, novo);
        }
        n = prox;
      }
    })(corpo, raiz);

    /* capa do Gutenberg vem como <svg><image/></svg>, que colapsa sem viewBox: vira <img> */
    Array.prototype.forEach.call(raiz.querySelectorAll('svg'), function (sv) {
      var im = sv.querySelector('image[data-src]');
      if (!im) { if (!sv.querySelector('path,rect,circle,line,polygon,text')) sv.remove(); return; }
      var novo = document.createElement('img');
      novo.setAttribute('data-src', im.getAttribute('data-src'));
      if (im.getAttribute('width')) novo.setAttribute('width', im.getAttribute('width'));
      if (im.getAttribute('height')) novo.setAttribute('height', im.getAttribute('height'));
      novo.setAttribute('alt', '');
      novo.className = 'aev-capa-livro';
      sv.parentNode.replaceChild(novo, sv);
    });

    /* blocos: o menor elemento de bloco que ainda contem o texto */
    var blocos = [];
    var ATOMICO = { TABLE: 1, PRE: 1, FIGURE: 1, UL: 1, OL: 1, DL: 1, HR: 1, BLOCKQUOTE: 1 };
    function temBlocoDentro(el) {
      for (var i = 0; i < el.children.length; i++) {
        if (BLOCOS[el.children[i].tagName.toUpperCase()]) return true;
      }
      return false;
    }
    (function acha(el) {
      for (var i = 0; i < el.children.length; i++) {
        var f = el.children[i];
        var tag = f.tagName.toUpperCase();
        if (!BLOCOS[tag]) continue;
        var classe = f.getAttribute('class') || '';
        if (ATOMICO[tag] || /aev-(verso|citacao|nota|legenda)/.test(classe)) { blocos.push(f); continue; }
        if (temBlocoDentro(f)) { acha(f); continue; }
        if ((f.textContent || '').trim() || f.querySelector('img')) blocos.push(f);
      }
    })(raiz);
    if (!blocos.length && raiz.children.length) blocos = Array.prototype.slice.call(raiz.children);

    /* sobras de interface que o Wikisource deixa no texto */
    blocos.forEach(function (b) {
      if (!/\[\s*(editar|edit)\s*\]/.test(b.textContent || '')) return;
      (function limpaTexto(el) {
        for (var i = 0; i < el.childNodes.length; i++) {
          var n = el.childNodes[i];
          if (n.nodeType === 3) n.nodeValue = n.nodeValue.replace(/\[\s*(editar|edit)\s*\]/g, '');
          else if (n.nodeType === 1) limpaTexto(n);
        }
      })(b);
    });

    var conta = 0;
    blocos.forEach(function (b, i) {
      var t = (b.textContent || '').replace(/\s+/g, ' ').trim();
      b.setAttribute('data-b', String(i));
      b.setAttribute('data-c', String(conta));
      conta += t.length + 1;
    });

    return { via: lido.via, raiz: raiz, blocos: blocos, letras: conta, versao: VERSAO };
  }

  return { limpa: limpa, traduz: traduz, CLASSES: CLASSES, VERSAO: VERSAO };
})();
