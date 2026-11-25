# ZELO — Brand Kit para Arcade.software

Tudo aqui é **copiar e colar** nos campos do Arcade. Os valores de cor, ícones e
telas foram extraídos do próprio código (`mobile/src/theme/palettes.ts`,
`mobile/src/components/CategoryIcon.tsx`) — nada foi inventado. Modo **claro**.

---

## 1. Logo

Arquivos em [`logo/`](./logo). SVG é vetor de verdade (paths, sem dependência de fonte).

| Arquivo | Usar quando |
|---|---|
| `zelo-wordmark-ink.svg/.png` | **Principal.** Fundo claro/creme/branco. PNG com fundo transparente. |
| `zelo-wordmark-cream.svg/.png` | Fundo escuro ou sobre foto escura. PNG transparente. |
| `zelo-wordmark-on-cream.svg/.png` | Já com o fundo creme da marca (#FAF7F2). |
| `zelo-wordmark-on-primary.svg/.png` | Já com o fundo terracota (#D9612E). |
| `zelo-icon-primary.svg/.png` | **Ícone/avatar/favicon.** Quadrado terracota com `z.` creme. |
| `zelo-icon-ink.svg/.png` | Ícone preto com `z` creme e ponto terracota. |
| `zelo-icon-cream.svg/.png` | Ícone creme com `z` preto e ponto terracota. |

**Regras do logo**
- O wordmark é sempre **minúsculo**: `zelo` — nunca "Zelo", "ZELO" ou "zelo." com ponto preto.
- O ponto é sempre **terracota** (`#D9612E`) e nunca muda de cor, exceto sobre fundo terracota (aí vira creme).
- Espaço livre mínimo ao redor: a altura da letra `o`.
- Não aplicar sombra, contorno, gradiente, inclinação ou distorção.
- Tamanho mínimo do wordmark: 80 px de largura.

---

## 2. Paleta de cores (modo claro)

Campos do Arcade, prontos para colar:

| Campo do Arcade | Hex | Nome interno | Onde aparece no app |
|---|---|---|---|
| **Primary** | `#D9612E` | Terracota / Saffron | Botão "Orçamento", chips ativos, ponto do logo, links |
| **Secondary** | `#0E0E10` | Ink | Botões principais (Entrar, Começar agora, Enviar solicitação), títulos |
| **Accent** | `#E8703C` | Saffron Hi | Realces, estado ativo, hover, barra de progresso |
| **Background** | `#FAF7F2` | Creme | Fundo de todas as telas |
| **Text** | `#0E0E10` | Ink | Todo o texto principal |
| **Dark neutral** | `#5C5852` | Cinza quente | Texto secundário, legendas, subtítulos |
| **Light neutral** | `#F3EFE7` | Creme fundo | Superfícies rebaixadas, chips inativos, divisórias |

**Cores de apoio** (não são campos do Arcade, mas aparecem nas telas — bom saber para não brigar com elas no vídeo):

| Hex | Uso |
|---|---|
| `#FFFFFF` | Superfície dos cards |
| `#3D7A4C` | Verde confiança — "Verificado", "Garantia de 90 dias", "Disponível" |
| `#B8861E` | Dourado das estrelas de avaliação |
| `#B8403D` | Vermelho do SOS / Emergência |
| `rgba(14,14,16,0.08)` | Linha divisória (hairline) |

> A identidade é intencionalmente de **duas cores**: terracota sobre creme, com preto
> para ação. Se o Arcade exigir um Secondary visualmente distinto do Text, use o
> verde confiança `#3D7A4C`.

---

## 3. Tipografia

O app usa a fonte de sistema (San Francisco no iOS, Roboto no Android). Para o vídeo,
o par abaixo é o equivalente web — grátis no Google Fonts e disponível no Arcade:

| Campo do Arcade | Fonte | Pesos | Ajuste |
|---|---|---|---|
| **Primary font** | **Inter Tight** | 700 / 800 | Títulos e wordmark. `letter-spacing: -2%` |
| **Secondary font** | **Inter** | 400 / 500 / 600 | Corpo, legendas, UI |

Escala usada no app (útil para reproduzir no vídeo): título de tela 32/38 px 700 ·
título de seção 26 px 800 · card 16 px 700 · corpo 15 px 400 · legenda 12–13 px 500 ·
eyebrow 11 px 700 maiúsculo com `letter-spacing: 1px`.

---

## 4. Ícones

**Categorias do produto** — 8 SVGs autorais em [`icons/`](./icons), traço 1.8, cantos
arredondados, viewBox 24×24, cor `#0E0E10`:

`encanador` · `eletricista` · `reformas` · `pintura` · `limpeza` · `moveis` ·
`ar-condicionado` · `jardinagem`

**Biblioteca de interface:** [Lucide](https://lucide.dev) (`lucide-react-native`),
traço 2. Ícones usados no app:

`ArrowLeft` `ArrowRight` `ArrowUpRight` `Bell` `Briefcase` `Calendar` `Check`
`ChevronDown` `ChevronRight` `Clock` `Copy` `CreditCard` `Heart` `Home` `LayoutGrid`
`Lock` `LogOut` `MailCheck` `MapPin` `MessageSquare` `Moon` `Phone` `Plus` `Search`
`Send` `Settings` `Share2` `ShieldCheck` `Smartphone` `Sparkles` `Star` `Sun`
`Trash2` `User` `UserCog` `X` `Zap`

---

## 5. Imagens principais do produto

Em [`product/`](./product) — capturas reais do app rodando, 1179×2556 px, modo claro.
Ordem sugerida para o roteiro do vídeo:

| # | Arquivo | O que mostra | Momento no vídeo |
|---|---|---|---|
| 1 | `01-abertura-welcome.png` | Tela de boas-vindas com a tagline | Abertura |
| 2 | `02-home.png` | Início: busca, orçamento, SOS, categorias | "Tudo começa aqui" |
| 3 | `03-lista-profissionais.png` | 6 profissionais com nota, bairro e preço | Prova social |
| 4 | `04-perfil-profissional.png` | KYC verificado, 4.9, 486 serviços, tabela de preços | Confiança |
| 5 | `05-orcamento-inteligente.png` | Estimativa R$ 240–380 com o que está incluso | Diferencial nº 1 |
| 6 | `06-emergencia-sos.png` | Botão SOS | Diferencial nº 2 |
| 7 | `07-emergencia-match.png` | Profissional encontrado, ETA 18 min | Payoff da emergência |
| 8 | `08-chat.png` | Conversa dentro do serviço | Acompanhamento |
| 9 | `09-agenda.png` | Agenda com 5 serviços em estados diferentes | Organização |
| 10 | `10-pagamento-pix.png` | PIX copia e cola | Fechamento do ciclo |
| 11 | `11-painel-prestador.png` | Painel do prestador: R$ 3.710 na semana | Lado B do marketplace |

O conjunto completo (30 telas) está em [`../screenshots/`](../screenshots).

---

## 6. Campos de texto do Arcade

### Tagline

```
Cuidamos do que importa em casa.
```

*Alternativas, se quiser testar:*
- `O profissional certo, com o preço na mesa antes de você chamar.`
- `Serviço em casa sem sustos: preço claro, gente verificada, 90 dias de garantia.`

*(EN, se o Arcade gerar narração em inglês: `We take care of what matters at home.`)*

### Product description

```
ZELO é um marketplace mobile que conecta moradores a profissionais verificados de
serviços domésticos — encanadores, eletricistas, pintores, diaristas, jardineiros e
técnicos de ar-condicionado. Antes de chamar alguém, o cliente monta um orçamento
inteligente em quatro toques e vê uma faixa de preço com tudo que está incluso. Em
uma emergência, o modo SOS encontra o profissional verificado mais próximo em
minutos, com tempo de chegada estimado. Do pedido ao pagamento, tudo acontece em um
lugar só: agenda, conversa por chat, pagamento via PIX ou cartão liberado apenas
após a confirmação do serviço, avaliação e garantia de 90 dias. Todo profissional
passa por verificação de RG, CPF e endereço antes de aparecer na busca.
```

*(EN: `ZELO is a mobile marketplace connecting homeowners with verified local service
professionals — plumbers, electricians, painters, cleaners, gardeners and HVAC techs.
Before booking, clients build a smart estimate in four taps and see a transparent
price range with everything included. In an emergency, SOS mode matches the closest
verified professional in minutes with a live ETA. From request to payment, everything
happens in one place: schedule, in-booking chat, PIX or card payment released only
after the job is confirmed, reviews and a 90-day guarantee. Every professional passes
ID, tax-ID and address verification before appearing in search.`)*

### Voice description

```
Direta, calorosa e concreta. Fala com o morador em "você", em frases curtas, como um
vizinho que entende do assunto e não enrola. Usa números reais do produto no lugar de
adjetivos — "18 minutos", "90 dias", "4,9 de 213 avaliações" — porque é isso que gera
confiança. Reconhece a dor antes de vender a solução: contratar serviço em casa dá
medo, e a marca fala disso sem drama. Tom editorial e calmo, nunca de anúncio gritado,
nunca corporativo. Português brasileiro coloquial e correto, sem gíria e sem jargão
de startup.
```

### Ideal Customer Profile (ICP)

```
Principal — quem contrata: morador urbano de 28 a 55 anos, classe B/C, dono ou
inquilino de apartamento ou casa em capital brasileira, com rotina cheia e pouca
tolerância a improviso. Já se queimou contratando por indicação de grupo de WhatsApp:
profissional que não apareceu, orçamento que dobrou no meio do serviço, ninguém para
chamar quando o cano estourou às 22h. Valoriza preço claro antes de fechar, gente
verificada e poder acompanhar tudo pelo celular. Usa PIX no dia a dia.

Secundário — quem executa: profissional autônomo de 25 a 55 anos (encanador,
eletricista, pintor, diarista, técnico de ar-condicionado) que hoje depende de
indicação boca a boca, tem agenda irregular e quer previsibilidade de renda, agenda
organizada e uma reputação que fique registrada em algum lugar.
```

### Key messaging (uma por linha)

```
Todo profissional é verificado: RG, CPF e endereço confirmados antes de aparecer na busca.
Você vê a faixa de preço antes de chamar alguém — orçamento inteligente em 4 toques.
Emergência às 22h? O modo SOS acha o profissional verificado mais próximo em minutos.
Pague só depois: o valor é liberado ao profissional após a confirmação do serviço.
Garantia de 90 dias em todos os serviços contratados pelo app.
Orçamento, agenda, conversa, pagamento e avaliação em um lugar só.
Para o profissional: agenda cheia, pagamento garantido e reputação que fica registrada.
```

### Do's

```
Use frases curtas e diretas, no máximo uma ideia por frase.
Fale com o cliente em "você", nunca em terceira pessoa.
Cite números reais que aparecem na tela (18 min, 90 dias, 4,9, R$ 240–380).
Mostre a tela real do app junto com a promessa que está sendo feita.
Nomeie o problema antes da solução ("vazamento às 22h" antes de "modo emergência").
Use os nomes oficiais das funções: Orçamento Inteligente, Modo Emergência, KYC Verificado.
Mantenha o terracota como único destaque de cor por cena.
Escreva valores em real no formato brasileiro: R$ 1.234,56.
```

### Don'ts

```
Não use jargão de startup nem tom corporativo (disruptivo, revolucionário, sinergia, solução completa).
Não prometa preço fixo — o produto entrega faixa de preço estimada, não valor fechado.
Não invente estatísticas, número de usuários, prêmios ou parcerias que o projeto não tem.
Não trate os profissionais como "mão de obra" ou "barato" — eles são o outro lado do marketplace.
Não use ponto de exclamação em série nem CAPS LOCK para vender.
Não misture as duas cores de destaque na mesma cena (terracota e vermelho de emergência).
Não use foto de banco de imagens genérica no lugar da tela real do produto.
Não escreva o nome da marca como "Zelo" ou "ZELO" no wordmark — é sempre "zelo" minúsculo.
```

### Words to avoid

```
disruptivo, revolucionário, inovador, sinergia, solução completa, uberização, plataforma all-in-one, mão de obra, mão de obra barata, clique aqui, imperdível, líder de mercado, o melhor do Brasil, garantido, 100% seguro, sem burocracia, gíria, sarcasmo
```

### Pronunciation

```
zelo = "ZÉ-lu" (tônica no ZÉ, o final soa como "lu"). Nunca "zíilo" nem "ZE-LÔ".
PIX = "píks", uma sílaba.
KYC = "cá-i-ci" (letra por letra, em português).
SOS = "és-ó-és" (letra por letra).
ETA = "É-T-A" (letra por letra) ou "tempo estimado de chegada".
R$ = "reais" (ex.: R$ 240 lê-se "duzentos e quarenta reais").
```

---

## 7. Resumo rápido (Brand Lock)

| Item | Valor |
|---|---|
| Nome | **zelo** (sempre minúsculo no wordmark) |
| Tagline | Cuidamos do que importa em casa. |
| Primary | `#D9612E` |
| Secondary | `#0E0E10` |
| Accent | `#E8703C` |
| Background | `#FAF7F2` |
| Text | `#0E0E10` |
| Dark neutral | `#5C5852` |
| Light neutral | `#F3EFE7` |
| Fonte display | Inter Tight 700/800, tracking −2% |
| Fonte corpo | Inter 400/500/600 |
| Formas | Cantos 10–20 px, pílula 9999 px para chips, ícone de app com raio 22,3% |
| Traço dos ícones | 1.8 (categorias) / 2.0 (Lucide) |
| Proibido | gradiente no logo, sombra no wordmark, cor no ponto que não seja terracota, tom corporativo |
