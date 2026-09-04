# ErpDrogariaCenterFront

Frontend do ERP Drogaria Center — React + Vite + TypeScript.

## Rodando localmente

```bash
npm install
cp .env.example .env
npm run dev
```

Por padrão o app fala com o backend no mesmo host da página, na porta `3333`. Só defina `VITE_API_URL` no `.env` se o backend estiver em outro endereço.

## Produção

- Front: `https://erp.drogariacenter.com.br`
- Backend: `https://apierp.drogariacenter.com.br`

Como front e backend ficam em **domínios diferentes** em produção, defina `VITE_API_URL=https://apierp.drogariacenter.com.br/api` no `.env` (ou nas variáveis de ambiente do provedor de build) antes de rodar `npm run build` — é uma variável de build-time do Vite, não dá pra trocar depois só no servidor.

Backend: [ErpDrogariaCenterBack](https://github.com/welsonvicente/ErpDrogariaCenterBack)
