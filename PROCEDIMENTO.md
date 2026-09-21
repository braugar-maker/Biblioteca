# Procedimento: Biblioteca Aevum

Escrito em 21 de setembro de 2026, para quem nunca mexeu nisto.

## O que é e onde está no ar

255 obras em domínio público, em EPUB e em PDF A5, com procedência em cada ficha. Pertence ao Instituto Aeviternitas. Lema: *quod manet*.

A Biblioteca vive em **dois lugares ao mesmo tempo**, e os dois precisam andar juntos:

1. **O site e os EPUBs**, no GitHub Pages: https://braugar-maker.github.io/Biblioteca
   Feed OPDS (aplicativos de leitura assinam este endereço): https://braugar-maker.github.io/Biblioteca/opds.xml
2. **Os PDFs**, no Cloudflare Pages: https://biblioteca.aeviternitas.com/pdf/

Pastas nesta máquina:

- Site e EPUBs: `/Users/macbook/Arquivos/Livros/site` (é este repositório, `braugar-maker/Biblioteca`, ramo `main`)
- PDFs prontos para enviar: `/Users/macbook/Arquivos/Livros/site-pdf`
- Acervo de origem: `/Volumes/Acervo/Livros`

## Como regerar o site

O volume Acervo precisa estar montado. Ligue o Drive Casa antes.

```bash
python3 ~/bin/pdlivro_site.py /Volumes/Acervo/Livros ~/Arquivos/Livros/site
```

Sai `index.html`, `catalogo.json`, `opds.xml`, `README.md`, `INDICE.md`, as capas em `capas/` e os EPUBs em `livros/`.

Se o volume não estiver disponível e a mudança for só de aparência ou de texto:

```bash
python3 ~/bin/pdlivro_site.py --de-catalogo ~/Arquivos/Livros/site
```

Isso relê o `catalogo.json` que já está publicado e não copia EPUB nenhum.

## Como regerar os PDFs

```bash
python3 ~/bin/pdlivro_pdf.py ~/Arquivos/Livros/site ~/Arquivos/Livros/site-pdf/pdf
```

Use `--so slug1,slug2` para refazer só algumas obras e `--forcar` para refazer o que já existe. O script usa o Chrome em segundo plano para imprimir; não feche o Chrome no meio.

## Como publicar

**Site e EPUBs:**

```bash
cd /Users/macbook/Arquivos/Livros/site && git add -A && git commit -m "descreva a mudança" && git push
```

**PDFs:**

```bash
cd /Users/macbook/Arquivos/Livros/site-pdf && npx wrangler pages deploy . --project-name biblioteca-aevum
```

Na primeira vez em uma máquina nova, `npx wrangler login` abre o navegador para autorizar a conta Cloudflare.

## Armadilhas conhecidas

- **Os dois lugares andam juntos, sempre.** Se você regerar o site sem reenviar os PDFs, as fichas vão apontar para PDFs que não existem, e o contrário deixa PDFs órfãos. Publique os dois na mesma sessão.
- **Livro segue o art. 41 da Lei 9.610/98** (morte do autor mais 70 anos), não o art. 44 que vale para filme. Camada A é livre no Brasil e nos Estados Unidos; camada B é livre só no Brasil.
- **Obras retiradas não voltam sozinhas.** O que foi retirado está em `/Users/macbook/Arquivos/Livros/_retirados-2026-09-10` e `_retirados-2026-09-11`; o que foi substituído, em `_substituidos-2026-09-11`. Se uma obra reaparecer no site sem passar por revisão, foi engano do acervo, não do script.
- **Gerador alterado se guarda antes.** Cada versão antiga de `~/bin/pdlivro_site.py` ficou ao lado com data e motivo no nome, como `pdlivro_site_2026-09-18_antes-apoio-sats.py`. Mantenha o hábito.
- **A pasta `dev/` não é publicada** (está no `.gitignore`). Não ponha lá nada que precise ir ao ar.

## O que este projeto não faz

Não hospeda obra sob direito, não reproduz capa de edição comercial (as capas são tipográficas, feitas pelo instituto) e não apaga nada do acervo.
