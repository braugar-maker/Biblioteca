/* Instituto Aeviternitas · leitor da Biblioteca Aevum · o pacote · 14/09/2026.
   Abre o EPUB com JSZip, le o container e o OPF, e entrega a lombada, o manifesto e os recursos.
   Nao toca no DOM. Nao depende do epub.js. */
window.AEV = window.AEV || {};

AEV.Pacote = (function () {
  'use strict';

  function texto(u8) {
    return new TextDecoder('utf-8').decode(u8);
  }

  function junta(base, href) {
    if (/^[a-z]+:/i.test(href)) return href;
    var partes = (base ? base.split('/') : []).concat(href.split('/'));
    var pilha = [];
    partes.forEach(function (p) {
      if (!p || p === '.') return;
      if (p === '..') { pilha.pop(); return; }
      pilha.push(p);
    });
    return pilha.join('/');
  }

  function atributos(tag) {
    var a = {}, re = /([\w:-]+)\s*=\s*"([^"]*)"/g, m;
    while ((m = re.exec(tag))) a[m[1]] = m[2];
    return a;
  }

  /* dimensoes lidas do cabecalho do arquivo, sem decodificar a imagem inteira */
  function dimensoes(u8, tipo) {
    try {
      if (tipo.indexOf('png') >= 0 || (u8[0] === 0x89 && u8[1] === 0x50)) {
        var v = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
        return { l: v.getUint32(16), a: v.getUint32(20) };
      }
      if (tipo.indexOf('gif') >= 0 || (u8[0] === 0x47 && u8[1] === 0x49)) {
        return { l: u8[6] | (u8[7] << 8), a: u8[8] | (u8[9] << 8) };
      }
      if (tipo.indexOf('jpeg') >= 0 || tipo.indexOf('jpg') >= 0 || (u8[0] === 0xFF && u8[1] === 0xD8)) {
        var i = 2;
        while (i < u8.length - 9) {
          if (u8[i] !== 0xFF) { i++; continue; }
          var marca = u8[i + 1];
          var tam = (u8[i + 2] << 8) | u8[i + 3];
          if (marca >= 0xC0 && marca <= 0xCF && marca !== 0xC4 && marca !== 0xC8 && marca !== 0xCC) {
            return { a: (u8[i + 5] << 8) | u8[i + 6], l: (u8[i + 7] << 8) | u8[i + 8] };
          }
          i += 2 + tam;
        }
      }
    } catch (e) {}
    return null;
  }

  function abre(bytes) {
    return JSZip.loadAsync(bytes).then(function (zip) {
      var arquivos = Object.keys(zip.files);
      function pega(nome) {
        var f = zip.file(nome);
        if (f) return f;
        var baixo = nome.toLowerCase();
        for (var i = 0; i < arquivos.length; i++) {
          if (arquivos[i].toLowerCase() === baixo) return zip.file(arquivos[i]);
        }
        return null;
      }
      var cont = pega('META-INF/container.xml');
      if (!cont) throw new Error('EPUB sem container.xml');
      return cont.async('uint8array').then(function (u8) {
        var m = /full-path="([^"]+)"/.exec(texto(u8));
        if (!m) throw new Error('container sem full-path');
        var opfNome = m[1];
        var f = pega(opfNome);
        if (!f) throw new Error('OPF nao encontrado: ' + opfNome);
        return f.async('uint8array').then(function (u) {
          return montar(zip, pega, opfNome, texto(u));
        });
      });
    });
  }

  function montar(zip, pega, opfNome, opf) {
    var base = opfNome.indexOf('/') >= 0 ? opfNome.slice(0, opfNome.lastIndexOf('/')) : '';
    var manifesto = {};
    var re = /<item\b[^>]*>/g, tag;
    while ((tag = re.exec(opf))) {
      var a = atributos(tag[0]);
      if (!a.id || !a.href) continue;
      manifesto[a.id] = {
        id: a.id,
        href: a.href,
        caminho: junta(base, decodeURIComponent(a.href)),
        tipo: a['media-type'] || '',
        props: a.properties || ''
      };
    }
    var lombada = [];
    var rs = /<itemref\b[^>]*>/g, t2;
    while ((t2 = rs.exec(opf))) {
      var b = atributos(t2[0]);
      var it = manifesto[b.idref];
      if (it && b.linear !== 'no') lombada.push(it);
      else if (it) lombada.push(it);
    }
    var meta = {};
    var mt = /<dc:([\w]+)[^>]*>([\s\S]*?)<\/dc:\1>/g, m3;
    while ((m3 = mt.exec(opf))) if (!meta[m3[1]]) meta[m3[1]] = m3[2].replace(/<[^>]+>/g, '').trim();

    var cache = {};
    function bytesDe(caminho) {
      if (cache[caminho]) return cache[caminho];
      var f = pega(caminho);
      if (!f) return (cache[caminho] = Promise.reject(new Error('faltando: ' + caminho)));
      return (cache[caminho] = f.async('uint8array'));
    }
    var urls = {};
    function urlDe(caminho, tipo) {
      if (urls[caminho]) return Promise.resolve(urls[caminho]);
      return bytesDe(caminho).then(function (u8) {
        var b = new Blob([u8], { type: tipo || 'application/octet-stream' });
        return (urls[caminho] = URL.createObjectURL(b));
      });
    }
    function dimensoesDe(caminho, tipo) {
      return bytesDe(caminho).then(function (u8) { return dimensoes(u8, tipo || ''); });
    }
    function textoDe(caminho) {
      return bytesDe(caminho).then(texto);
    }
    function solta() {
      Object.keys(urls).forEach(function (k) { try { URL.revokeObjectURL(urls[k]); } catch (e) {} });
    }
    function porCaminho(caminho) {
      var alvo = caminho.split('#')[0];
      for (var id in manifesto) if (manifesto[id].caminho === alvo) return manifesto[id];
      return null;
    }
    function capa() {
      for (var id in manifesto) if ((manifesto[id].props || '').indexOf('cover-image') >= 0) return manifesto[id];
      var m = /<meta[^>]*name="cover"[^>]*content="([^"]+)"/.exec(opf) || /<meta[^>]*content="([^"]+)"[^>]*name="cover"/.exec(opf);
      if (m && manifesto[m[1]] && manifesto[m[1]].tipo.indexOf('image') === 0) return manifesto[m[1]];
      return null;
    }
    function navegacao() {
      for (var id in manifesto) if ((manifesto[id].props || '').indexOf('nav') >= 0) return manifesto[id];
      for (var id2 in manifesto) if (manifesto[id2].tipo.indexOf('dtbncx') >= 0) return manifesto[id2];
      return null;
    }

    return {
      opfNome: opfNome, base: base, opf: opf,
      manifesto: manifesto, lombada: lombada, meta: meta,
      bytesDe: bytesDe, textoDe: textoDe, urlDe: urlDe, dimensoesDe: dimensoesDe,
      porCaminho: porCaminho, capa: capa, navegacao: navegacao, junta: junta, solta: solta
    };
  }

  return { abre: abre, junta: junta, dimensoes: dimensoes };
})();
