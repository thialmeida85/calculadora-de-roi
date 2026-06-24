# Calculadora de ROI em Marketing — Agência Verticale

MVP de um funil conversacional que calcula o ponto de equilíbrio de um investimento em marketing e usa a Groq apenas para explicar os resultados. Toda a matemática é determinística e continua funcionando mesmo sem IA.

## O que está incluído

- Perguntas em sequência, uma decisão por tela
- Venda única e receita recorrente
- Investimento total, clientes e leads para equilíbrio
- CPL máximo sustentável
- Projeção conservadora, provável e otimista quando o CPL é conhecido
- Análise textual via Groq, com fallback local
- Captura de nome, WhatsApp e e-mail
- Webhook opcional para Make, n8n, Kommo ou outro CRM
- Layout responsivo com a identidade da Agência Verticale
- `render.yaml` pronto para deploy

## Rodar localmente

```bash
python -m venv .venv
# Windows
.venv\Scripts\activate
# Linux/macOS
source .venv/bin/activate

pip install -r requirements.txt
cp .env.example .env
python app.py
```

O Flask não carrega `.env` automaticamente neste MVP. No desenvolvimento, configure as variáveis no terminal ou instale `python-dotenv`. A aplicação funciona sem `GROQ_API_KEY`, usando uma análise local.

## Variáveis de ambiente

| Variável | Uso |
|---|---|
| `GROQ_API_KEY` | Chave da Groq. Opcional, mas ativa a análise personalizada. |
| `GROQ_MODEL` | Modelo usado. Padrão: `llama-3.3-70b-versatile`. |
| `WHATSAPP_NUMBER` | Número do CTA final no formato `5512999999999`. |
| `LEAD_WEBHOOK_URL` | URL que recebe contato, cálculo e diagnóstico em JSON. |
| `PRIVACY_URL` | Link da política de privacidade. |

## Deploy na Render

1. Suba esta pasta em um repositório do GitHub.
2. Na Render, escolha **New > Blueprint** e conecte o repositório. O arquivo `render.yaml` cria o serviço.
3. Preencha os secrets `GROQ_API_KEY`, `WHATSAPP_NUMBER`, `LEAD_WEBHOOK_URL` e `PRIVACY_URL`.
4. Faça o deploy.

Também é possível criar um Web Service manualmente:

- Build Command: `pip install -r requirements.txt`
- Start Command: `gunicorn app:app`
- Health Check Path: `/health`

## Webhook de leads

Se `LEAD_WEBHOOK_URL` estiver configurada, a aplicação envia um POST com esta estrutura:

```json
{
  "source": "calculadora_roi_verticale",
  "contact": {
    "name": "Nome",
    "email": "email@empresa.com",
    "phone": "(12) 99999-9999"
  },
  "calculation": {},
  "analysis": {}
}
```

No Make ou n8n, use um webhook de entrada e depois crie ou atualize o contato no Kommo.

### Salvar leads no Google Sheets

Uma opção simples é usar uma planilha do Google Sheets com Google Apps Script:

1. Crie uma planilha no Google Sheets.
2. Abra **Extensões > Apps Script**.
3. Cole o conteúdo de `integrations/google-sheets-webhook.gs`.
4. Salve o projeto.
5. Clique em **Implantar > Nova implantação**.
6. Escolha o tipo **App da Web**.
7. Em **Executar como**, selecione você.
8. Em **Quem pode acessar**, selecione qualquer pessoa com o link.
9. Autorize o script e copie a URL do Web App.
10. Na Render, use essa URL como `LEAD_WEBHOOK_URL`.

Quando a calculadora receber um lead, o script cria/usa a aba `Leads` e adiciona uma nova linha com contato, métricas principais, diagnóstico e JSON bruto.

## Princípio de segurança

A Groq nunca calcula o ROI. Ela recebe os resultados já calculados e apenas os traduz para uma explicação. Se a API falhar, estiver sem saldo ou retornar algo inválido, o usuário ainda recebe uma análise local.

## Antes de publicar

- Troque o número do WhatsApp
- Publique uma política de privacidade
- Configure o webhook do CRM
- Faça testes com números reais de diferentes segmentos
- Revise os textos jurídicos e de consentimento com orientação adequada ao seu negócio
