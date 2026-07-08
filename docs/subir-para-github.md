# Como subir o projeto para o GitHub pelo terminal

Este projeto já está preparado localmente. Para publicar no GitHub, você precisa executar o `git push` em uma máquina que tenha acesso ao GitHub pela rede.

> Segurança: se um token foi compartilhado em chat, revogue-o no GitHub e gere um novo antes de usar.

## 1. Conferir o remoto

Na raiz do projeto, rode:

```bash
git remote -v
```

Se não aparecer `origin`, configure:

```bash
git remote add origin https://github.com/Gravit-Studios/delicias-da-tai-calc.git
```

Se aparecer um `origin` errado, ajuste:

```bash
git remote set-url origin https://github.com/Gravit-Studios/delicias-da-tai-calc.git
```

## 2. Garantir que o branch principal é `main`

```bash
git branch -M main
```

## 3. Criar um Personal Access Token no GitHub

1. Acesse GitHub > **Settings**.
2. Entre em **Developer settings**.
3. Abra **Personal access tokens**.
4. Prefira **Fine-grained tokens**.
5. Selecione o repositório `Gravit-Studios/delicias-da-tai-calc`.
6. Configure as permissões:
   - **Contents**: `Read and write`
   - **Metadata**: `Read-only`
7. Gere o token e copie o valor.

## 4. Fazer o push com autorização pelo terminal

Rode:

```bash
git push -u origin main
```

Quando o terminal pedir credenciais:

- **Username**: seu usuário do GitHub.
- **Password**: cole o Personal Access Token novo.

## 5. Alternativa com token via URL temporária

Use apenas se estiver em um terminal privado. Não salve essa URL em arquivos.

```bash
git push https://SEU_USUARIO:SEU_TOKEN@github.com/Gravit-Studios/delicias-da-tai-calc.git main
```

Depois, confirme que o remoto não ficou com token salvo:

```bash
git remote -v
```

Se o token aparecer no remoto, corrija imediatamente:

```bash
git remote set-url origin https://github.com/Gravit-Studios/delicias-da-tai-calc.git
```

## 6. Validar no GitHub e na Vercel

Após o push, o GitHub deve mostrar os arquivos do projeto, como:

- `index.html`
- `src/main.js`
- `src/pricing.js`
- `src/styles.css`
- `package.json`

A Vercel deve iniciar um novo deploy automaticamente quando detectar o commit no branch `main`.

## Problemas comuns

### `Repository not found`

Verifique se o repositório existe e se sua conta tem acesso de escrita.

### `Authentication failed`

Gere um novo token com permissão **Contents: Read and write**.

### `CONNECT tunnel failed, response 403`

Isso é bloqueio de rede/proxy da máquina ou ambiente. Faça o push em outra rede ou computador com acesso ao GitHub.
