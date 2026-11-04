# Entrega 1 — Personas

> Projeto: **Zelo — Marketplace mobile de serviços locais**  
> Curso: Desenvolvimento de Sistemas — 4º AMS DS  
> Integrantes: Andrey, Paola, Enzo, Gabriel Prado  
> Data de início: 24/02/2026

---

## 1. Definição do Projeto

### Problema

Contratar um serviço doméstico de confiança (encanador, eletricista, diarista, pintor, montador de móveis) hoje depende quase sempre de indicação de conhecidos, grupos de WhatsApp de condomínio ou anúncios sem qualquer verificação. Isso gera três dores recorrentes para os usuários:

1. **Insegurança sobre a qualificação do profissional** — não existe uma forma prática de saber se a pessoa é experiente, se já cumpriu prazos, se aceita voltar em caso de retrabalho.
2. **Falta de previsibilidade de preço** — o cliente descobre o valor só depois da visita técnica, o que abre espaço para preço abusivo (principalmente em urgência, quando a comparação é impossível).
3. **Nenhuma resposta rápida em emergência** — vazamento à noite, curto-circuito no fim de semana e afins deixam o cliente refém da sorte de quem responde primeiro no WhatsApp.

Do outro lado, o profissional autônomo depende do boca a boca para lotar a agenda, não tem como comprovar reputação para novos clientes e paga taxas altas em plataformas que "vendem lead" sem qualquer garantia de fechamento. O problema afeta os dois lados do mercado ao mesmo tempo — cliente sem confiança, profissional sem previsibilidade — e é isso que o Zelo se propõe a resolver.

### Contexto

O **Zelo** é um marketplace mobile de serviços locais construído como projeto do grupo. A proposta é conectar clientes a profissionais **verificados** (encanador, eletricista, diarista, pintor, montador) com fluxo transparente de ponta a ponta: busca com filtros, orçamento guiado antes da proposta, modo emergência com casamento por proximidade real, chat 1:1 dentro do agendamento, pagamento (PIX ou cartão) e avaliação ao final — que alimenta a nota de confiança do profissional.

**Soluções semelhantes no mercado:**

| Concorrente | Modelo | Limites observados |
|---|---|---|
| GetNinjas | Prestador paga por lead (moedas) | Cliente recebe muitos contatos; prestador reclama de lead frio e sem garantia |
| TrocaJá / Habitissimo | Diretório com orçamentos | Sem verificação forte; preço opaco até a visita |
| Grupos de WhatsApp de condomínio | Indicação informal | Sem histórico, sem avaliação padronizada, sem cobertura fora do círculo |
| Uber / iFood (para serviços) | Casamento por proximidade em delivery | Nenhum resolve serviços domésticos com orçamento e emergência |

**Diferenciais do Zelo:**

- **Verificação de identidade** e ranking por reputação real (avaliação alimenta o algoritmo).
- **Orçamento inteligente** — estimativa guiada antes de o cliente pedir a proposta.
- **Modo emergência** — casamento pelo profissional verificado *de fato* mais próximo (PostGIS), com degradação segura.
- **Carrossel "Para você"** — recomendação personalizada por histórico (modelo colaborativo), com fallback para ordenação por avaliação.
- **Chat 1:1 em tempo real** dentro do próprio agendamento (WebSocket).

### Objetivos

**Para o cliente:**
- Contratar um profissional verificado em **menos de 5 minutos** no fluxo comum e em **menos de 2 minutos** no fluxo de emergência.
- Ter uma **estimativa de orçamento** antes de solicitar a proposta.
- Acompanhar o status do agendamento e conversar diretamente com o profissional pelo próprio app.
- Confiar na reputação: só profissionais verificados aparecem e a nota reflete avaliações reais.

**Para o profissional:**
- Encher horários ociosos da agenda com demanda qualificada.
- Autogerir perfil, serviços e preços em fluxo curto.
- Receber notificação imediata de nova demanda (principalmente em emergência).
- Ter painel de desempenho com métricas de avaliação, ganhos e conversão.

**Para o produto (indicadores de sucesso):**
- Taxa de conclusão do fluxo de contratação ≥ 60%.
- Tempo médio entre pedido e casamento no modo emergência ≤ 90 segundos.
- NPS do cliente ≥ 50 após 3 meses de operação.
- Recontratação (mesmo cliente em 90 dias) ≥ 25%.

### Hipóteses

O que **acreditamos saber** sobre os usuários neste momento — a validar nas próximas entregas:

1. **Confiança pesa mais que preço** na decisão de contratação — o usuário aceita pagar 10–20% mais por um profissional verificado com boa avaliação.
2. **Urgência muda o comportamento**: no modo emergência a tolerância a preço sobe e a exigência de resposta rápida se torna o critério dominante.
3. **A dor da imprevisibilidade de preço é maior que a de encontrar o profissional em si** — a maioria já tem alguém "mais ou menos" em mente, mas não sabe quanto o serviço deve custar.
4. **Prestadores autônomos rejeitam plataformas que cobram por lead** — preferem comissão sobre serviço realizado.
5. Prestadores usam o celular como ferramenta principal — o app precisa ser **rápido, com poucos toques** e funcionar bem em 4G instável.
6. **O cliente confia em avaliações**, mas desconfia de nota 5,0 perfeita — quer ver comentários reais, com contexto.
7. Notificações push são o canal preferido do prestador; SMS/ligação são vistos como intrusivos fora do horário comercial.

---

## 2. Pesquisa

### Como coletamos os dados

Combinamos três frentes de pesquisa qualitativa e uma frente de análise de mercado:

1. **Entrevistas semiestruturadas (n = 8)** com pessoas que contrataram serviços domésticos nos últimos 6 meses. Roteiro focado em: última contratação, como escolheu o profissional, dores, o que faria diferente.
2. **Entrevistas com prestadores autônomos (n = 3)** — 1 encanador, 1 eletricista, 1 diarista. Foco: como conseguem clientes, o que acham das plataformas existentes, o que os faria migrar.
3. **Observação de comportamento em grupos de WhatsApp de condomínio** — 2 grupos, 30 dias, padrão de pedido de indicação e velocidade de resposta.
4. **Análise de concorrentes** — GetNinjas, TrocaJá, Habitissimo, Juntos Somos +, iFood/Uber. Leitura de reviews 1–2 estrelas na Play Store e App Store para mapear reclamações recorrentes.

### Principais achados

- **Confiança > preço** — 7 em 8 clientes disseram que pagariam 10–20% mais por um profissional "comprovadamente confiável".
- **A busca começa em uma dor concreta**, não em navegação exploratória. Ninguém abre um app de serviços para "ver o que tem" — abre porque algo quebrou.
- **A imprevisibilidade de preço é a segunda maior dor** (6/8), atrás só do medo de o profissional não aparecer.
- **Prestadores rejeitam "venda de lead"** — os 3 entrevistados citaram, sem estímulo, o modelo de moedas do GetNinjas como principal motivo de terem parado de usar.
- **Nenhum concorrente tem "modo emergência" formal** — a busca urgente é tratada igual à busca comum.
- **O idoso é um vazio de pesquisa** — não conseguimos entrevistar ninguém acima de 55 anos; tratamos acessibilidade como restrição transversal, não como persona.
- **Comentários com contexto** ("consertou, atrasou 15min mas avisou") geram mais confiança que nota agregada.

---

## 3. Persona Primária

### 👩‍💻 Marina Souza — a cliente em situação de dor doméstica

| Campo | Descrição |
|---|---|
| **Nome** | Marina Souza |
| **Idade** | 34 anos |
| **Ocupação** | Analista administrativa em uma seguradora |
| **Onde mora** | Apartamento próprio na Zona Sul de São Paulo, com o marido e uma filha de 6 anos |
| **Situação econômica** | Classe média — renda familiar entre R$ 8.000 e R$ 12.000/mês. Prioriza custo-benefício, mas aceita pagar um pouco mais por segurança e previsibilidade. |
| **Competências digitais** | **Altas.** Usa iFood, Uber, apps de banco, Instagram e WhatsApp com fluência. Conforto com pagamento por PIX e cartão dentro do app. Não gosta de cadastros longos. |

#### Objetivos
- Resolver um problema doméstico (vazamento, elétrica, limpeza pesada, montagem) **de forma rápida e sem depender de indicação**.
- Saber, antes de fechar, **quanto o serviço vai custar em média** — para não ser surpreendida pelo preço.
- Contratar alguém em quem **se sinta segura** para deixar dentro de casa, especialmente quando a filha está por perto.
- Em emergência (vazamento à noite, curto-circuito no fim de semana), **conseguir alguém competente na primeira tentativa**, sem perder tempo no grupo do condomínio.

#### Necessidades
- Ver **verificação de identidade** e histórico do profissional antes de contratar.
- Ler **avaliações com contexto** (não só a nota — quer entender por que o cliente anterior deu 4 e não 5).
- **Estimativa de orçamento guiada** antes de solicitar a proposta.
- **Chat direto** com o profissional para tirar dúvidas antes e durante o serviço.
- **Acompanhamento em tempo real** do status (aceito, a caminho, em andamento, concluído).
- **Modo emergência** que case ela com o profissional mais próximo e bem avaliado — sem ter que filtrar nada.
- Pagamento **pelo próprio app** (PIX ou cartão) — não gosta de negociar dinheiro na porta.

#### Frustrações
- Já pagou preço absurdo em emergência porque "não tinha com quem comparar".
- Já esperou meio dia por um profissional que confirmou e não apareceu.
- Detesta ter que pedir indicação no grupo do prédio e ficar refém de quem responder primeiro.
- Desconfia de perfil com nota 5,0 perfeita e nenhum comentário.
- Cadastros longos, formulários repetitivos e apps que pedem foto de documento sem explicar por quê.

#### Citação representativa
> *"Se der problema em casa à noite, eu preciso resolver na hora — sem depender da sorte de quem meu vizinho conhece. Prefiro pagar 50 reais a mais e dormir tranquila."*

#### Cenário típico
Sábado, 22h. A pia do banheiro entope e começa a vazar para o apartamento de baixo. Marina não consegue esperar até segunda. Abre o Zelo, aciona o modo emergência, aceita a proposta do profissional casado pelo app (encanador verificado, 4,8 de nota, 2,3 km de distância) e acompanha a chegada em tempo real. Paga por PIX ao final e avalia — reforçando a nota que ajudou a próxima Marina.

---

## 4. Persona Secundária

### 🛠️ Carlos Almeida — o prestador autônomo que quer previsibilidade

| Campo | Descrição |
|---|---|
| **Nome** | Carlos Almeida |
| **Idade** | 42 anos |
| **Ocupação** | Encanador autônomo há 15 anos. Trabalhava em uma construtora até 2018, quando saiu para atender por conta própria. |
| **Onde mora** | Zona Leste de São Paulo. Atende principalmente Zona Leste, Centro e parte da Zona Sul (via metrô + moto). |
| **Situação econômica** | Renda variável entre R$ 3.000 e R$ 6.000/mês, dependendo do fluxo. Sustenta a esposa e dois filhos. Sem carteira assinada, então **previsibilidade de agenda é sobrevivência**. |
| **Competências digitais** | **Médias.** WhatsApp Business, Uber (como passageiro), PIX no app do banco, algumas redes sociais. **Não gosta** de apps com muitos menus, cadastros longos, ou fluxos que exigem digitação demorada — trabalha com as mãos sujas e pouco tempo entre serviços. |

#### Objetivos
- **Preencher a agenda** — principalmente em horários ociosos (manhãs de terça e quarta, por exemplo).
- Construir **reputação digital** que valorize os 15 anos de experiência que ele não consegue comprovar hoje para um cliente novo.
- Reduzir a dependência do **boca a boca** (que é bom, mas imprevisível).
- **Receber com segurança** — sem risco de calote e sem depender de dinheiro em espécie na hora.

#### Necessidades
- Cadastro rápido de perfil, serviços e preços — em fluxo curto, sem formulários intermináveis.
- **Notificação push imediata** de nova demanda, com destaque visual para emergências (que pagam mais).
- **Painel simples** com métricas do mês: quantos serviços, quanto ganhou, avaliação média, taxa de resposta.
- Poder **aceitar ou recusar** um pedido com uma decisão só, direto da notificação.
- Chat com o cliente para alinhar detalhes antes de sair de casa (evita viagem perdida).
- Recebimento por **PIX ou cartão pelo próprio app**, com repasse claro e rápido.
- **Cobrança justa** — modelo de comissão sobre serviço realizado (só paga se converteu), não venda de lead.

#### Frustrações
- Plataformas que cobram por lead e não garantem fechamento — já perdeu dinheiro comprando "moedas" no GetNinjas.
- Clientes que somem depois do primeiro contato ("me dá orçamento aí que eu te retorno").
- Não ter como provar que é experiente para um cliente que nunca ouviu falar dele.
- Apps complicados, com muitas telas — perde interesse rápido.
- Ter que atender no WhatsApp pessoal, misturando trabalho e família.

#### Citação representativa
> *"Quero trabalho, não passar a noite mexendo em app. Se a plataforma facilita minha vida e não cobra antes de eu ganhar, eu fico. Se cobra por lead e o cara nem responde, dura uma semana."*

#### Cenário típico
Terça, 10h da manhã, agenda vazia. Carlos recebe uma notificação push: "Nova demanda — troca de registro em Perdizes, 4,7 km, R$ 180 estimado". Aceita direto da notificação, conversa 30 segundos no chat para confirmar o endereço e sai. Ao terminar, marca como concluído, recebe o PIX no app e vê a avaliação nova subir a média para 4,9 — o que faz o algoritmo colocá-lo no topo do próximo carrossel "Para você" da região.

---

## 5. Reflexão da Equipe

### Quais decisões foram difíceis?

- **Separar "cliente comum" de "cliente em emergência".** No começo tratamos como personas diferentes, mas percebemos que é a *mesma* persona em cenários distintos — o que muda é o contexto e o critério dominante (rapidez vs. custo-benefício). Manter a mesma persona nos forçou a projetar um app coerente, com o modo emergência como uma *variação de fluxo*, não como um produto separado.

- **Escolher um único prestador como persona secundária.** Cogitamos personas separadas por categoria (encanador, eletricista, diarista, pintor), mas isso pulverizaria as decisões de projeto. Optamos pelo *encanador autônomo* como arquétipo do prestador "mão-na-massa" — quem trabalha em rua, com celular na mão, sem tempo para configurar app. A validação com eletricista e diarista mostrou dores muito parecidas.

- **Não criar uma persona idosa (55+).** Não conseguimos entrevistar ninguém dessa faixa. Optamos por **não inventar** — tratamos acessibilidade como restrição transversal de projeto (contraste, tamanho de fonte, fluxos curtos) em vez de uma persona sem evidência.

### Que informações ainda faltam?

- Dados quantitativos de mercado por região (share dos concorrentes em SP, tempo médio real de resposta).
- Comportamento de recontratação — o cliente volta a chamar o *mesmo* profissional? Isso muda o peso da personalização vs. proximidade no algoritmo.
- Perfil do prestador em cidades menores (nossa amostra é toda de São Paulo capital).
- Comportamento do usuário 55+ (não conseguimos entrevistas — hipótese não validada).
- Sensibilidade a preço em faixas de renda diferentes (nossa amostra concentrou classe média).

### Que outros elementos poderiam ser relevantes?

- **Canal preferido de comunicação em cada momento** (push vs. SMS vs. ligação) — provavelmente muda entre "contratação comum" e "emergência às 22h".
- **Disposição a pagar por garantia estendida** ou retrabalho gratuito.
- **Contexto físico do uso** (mãos sujas, ambiente barulhento, luz baixa) — importante para prestador.
- **Rede social e círculo de influência** — quem indica para quem, quem confia em quem, e como a plataforma pode facilitar (não substituir) essa camada.
- **Estado emocional no momento do uso** — Marina em emergência não é a mesma Marina do sábado de manhã escolhendo faxineira; o app precisa reconhecer isso na linguagem e no fluxo.

---

## 6. Checklist

- [x] As personas foram baseadas em evidências?
- [x] Há objetivos claros?
- [x] As necessidades estão relacionadas ao problema do projeto?
- [x] A Persona Primária e a Secundária são diferentes entre si?

---

## 7. Feedback recebido em aula

*Espaço reservado para registro após discussão em aula.*