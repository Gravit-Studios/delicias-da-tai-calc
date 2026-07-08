# Delícias da Tai Calc

Sistema de cálculo e precificação de produtos para confeitaria.

## Funcionalidades

- Cadastro dinâmico dos ingredientes da ficha técnica.
- Cálculo proporcional do custo usado a partir do preço e quantidade comprada.
- Composição com embalagem, custos operacionais, mão de obra e margem de lucro.
- Resultado de custo total, preço sugerido e valores unitários por rendimento.

## Como executar

```bash
npm install
npm run start
```

## Validação

```bash
npm test
npm run build
```
## Publicação no GitHub

O passo a passo para autorizar pelo terminal e publicar no GitHub está em [`docs/subir-para-github.md`](docs/subir-para-github.md).

## Deploy na Vercel

O projeto tem um `vercel.json` configurado com:
- `buildCommand`: `npm run build`
- `outputDirectory`: `dist`

Basta importar o repositório na Vercel; não é necessária nenhuma configuração manual adicional.

## Banco de dados (Supabase)

O projeto usa [Supabase](https://supabase.com) para autenticação e persistência de produtos, ingredientes e histórico de cálculos.

1. Rode o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) no **SQL Editor** do seu projeto Supabase para criar as tabelas e políticas de RLS.
2. As credenciais (URL e chave `anon`/`publishable`) ficam em `src/supabaseClient.js`. A chave anon é pública por natureza — a segurança é garantida pelas políticas de Row Level Security do banco.
3. Funcionalidades disponíveis após login:
   - Login/cadastro por e-mail e senha
   - Salvar e reabrir produtos/receitas
   - Cadastro reutilizável de ingredientes
   - Histórico dos últimos cálculos de precificação

