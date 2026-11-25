# Entrega 2 — Mapa de Jornada

> Projeto: **Zelo — Marketplace mobile de serviços locais**  
> Curso: Desenvolvimento de Sistemas — 4º AMS DS  
> Integrantes: Andrey, Paola, Enzo, Gabriel Prado  
> Data: 11/09/2026

---

## 1. Cenário de Uso

O cenário escolhido acompanha **Marina Souza**, persona primária do projeto, em uma situação de alta pressão: **sábado, 22h**, ela percebe que a pia do banheiro entupiu e começou a vazar para o apartamento de baixo. A filha já está dormindo, o marido tenta conter a água com panos e Marina precisa resolver o problema sem depender da sorte de alguém responder no grupo do condomínio.

Ela abre o **ZELO** no celular porque precisa de três coisas ao mesmo tempo: alguém verificado para entrar em casa à noite, uma noção clara de preço antes de confirmar e resposta rápida. Como é uma emergência, ela não quer comparar dezenas de perfis manualmente. Aciona o **Modo Emergência**, informa que é um vazamento/entupimento, confirma a localização e recebe um encanador verificado, bem avaliado e próximo, com tempo estimado de chegada.

Depois de aceitar, Marina acompanha o status pelo app, conversa pelo chat para explicar o problema, confirma a conclusão do serviço, paga por PIX e avalia o profissional. A jornada foi construída sobre o fluxo real previsto no produto: busca/triagem, orçamento inteligente, casamento por proximidade, chat, acompanhamento, pagamento e avaliação.

---

## 2. Mapa da Jornada

| Etapa | Ações | Pensamentos | Emoções | Dores | Oportunidades |
|---|---|---|---|---|---|
| **1. Perceber o problema** | Marina nota o vazamento, tenta conter a água e mede a urgência da situação. | *"Se isso chegar no apartamento de baixo, o prejuízo vai ser maior."* | Susto, pressa e sensação de perda de controle. | Não sabe se o problema é simples ou grave; não tem tempo para pesquisar com calma. | Linguagem de emergência no app, categorias rápidas e orientação inicial para reduzir a ansiedade. |
| **2. Procurar ajuda** | Abre o ZELO em vez de mandar mensagem no grupo do condomínio. | *"Preciso de alguém confiável agora, não de dez indicações aleatórias."* | Esperança com desconfiança. | Medo de chamar alguém desconhecido para dentro de casa à noite. | Destacar a verificação de identidade, avaliações contextualizadas e garantia logo no início do fluxo. |
| **3. Acionar o Modo Emergência** | Toca no SOS, escolhe a categoria encanador/vazamento e confirma a localização. | *"Não quero preencher um formulário longo; só quero resolver."* | Urgência e impaciência. | Formulários longos aumentam o abandono em situação crítica. | Fluxo curto, poucos campos obrigatórios, uso de localização e descrição por opções guiadas. |
| **4. Receber a indicação** | Vê o profissional indicado: distância, nota, selo de verificação, preço estimado e ETA. | *"Ele parece confiável, mas quanto isso pode custar?"* | Alívio parcial e cautela. | Falta de previsibilidade de preço e medo de cobrança abusiva por ser emergência. | Mostrar a faixa de preço, os itens inclusos, a taxa de urgência quando houver e o motivo da recomendação. |
| **5. Confirmar a solicitação** | Aceita a proposta/agendamento emergencial e acompanha o status. | *"Agora preciso saber se ele vem mesmo."* | Ansiedade diminuindo, mas ainda alerta. | Já viveu atraso ou não comparecimento de profissional confirmado. | Status em tempo real, notificação push, ETA atualizado e botão de contato no próprio agendamento. |
| **6. Conversar antes da chegada** | Usa o chat 1:1 para enviar detalhes e ponto de referência. | *"Se ele entender antes, talvez resolva mais rápido."* | Mais confiança e sensação de preparo. | Ter que migrar para o WhatsApp expõe o telefone pessoal e fragmenta a comunicação. | Chat dentro do agendamento e histórico salvo da conversa. |
| **7. Acompanhar a execução** | Recebe o profissional, acompanha o conserto e verifica se o vazamento parou. | *"Quero ter certeza de que não vou pagar por algo mal resolvido."* | Atenção e necessidade de controle. | Insegurança sobre a qualidade e sobre retrabalho depois que o profissional vai embora. | Checklist de conclusão, garantia de 90 dias e confirmação explícita antes de liberar o pagamento. |
| **8. Pagar e avaliar** | Confirma a conclusão, paga por PIX no app e deixa uma avaliação com comentário. | *"Se funcionou, vale registrar para ajudar a próxima pessoa."* | Alívio, confiança e fechamento. | Pagamento fora do app gera negociação desconfortável e pouca rastreabilidade. | Pagamento pelo app, recibo, histórico do serviço e avaliação que alimenta a reputação do profissional. |

---

## 3. Priorização das Dores

As três dores mais importantes da jornada são:

### 1. Falta de confiança para receber um desconhecido em casa
Esta é a dor mais sensível porque envolve **segurança física, privacidade e responsabilidade familiar**. Para Marina, não basta o profissional estar disponível: ele precisa ser verificável, bem avaliado e ter histórico confiável. Sem isso, o app não supera o grupo do condomínio, que, apesar de informal, ainda transmite confiança social.

### 2. Imprevisibilidade de preço em situação de urgência
Em emergência, Marina tem **menos poder de comparação** e maior risco de aceitar qualquer valor para resolver rápido. A falta de faixa de preço antes da confirmação gera medo de abuso e pode levar ao abandono do fluxo ou à negociação fora do app.

### 3. Incerteza sobre resposta, chegada e andamento do serviço
Depois de confirmar, a ansiedade não acaba: Marina precisa saber se o profissional **aceitou de fato**, se está a caminho, quanto falta para chegar e se poderá falar com ele sem sair do app. Essa dor é crítica porque o produto promete rapidez; se a comunicação falha, a sensação de controle desaparece.

**Justificativa:** Essas três dores foram priorizadas porque aparecem no problema inicial, nas hipóteses da equipe e nas necessidades da persona primária. Elas também representam momentos diferentes da jornada: decisão de confiar, decisão de pagar e acompanhamento até a solução.

---

## 4. Requisitos Derivados

| Dor priorizada | Requisito do sistema | Critério de aceitação |
|---|---|---|
| Falta de confiança para receber um desconhecido em casa | **RF01 - Perfil verificado do profissional.** O sistema deve exibir selo de verificação, categoria, nota média, quantidade de avaliações, região de atendimento e histórico resumido antes da confirmação. | Marina consegue identificar, antes de aceitar, se o profissional é verificado, qual é sua nota e quais comentários sustentam sua reputação. |
| Falta de confiança para receber um desconhecido em casa | **RF02 - Avaliações contextualizadas.** O sistema deve permitir avaliação com nota, comentário e vínculo com um serviço concluído. | Apenas clientes com serviço finalizado conseguem avaliar; a avaliação aparece no perfil e alimenta a nota do profissional. |
| Imprevisibilidade de preço em situação de urgência | **RF03 - Orçamento inteligente com faixa estimada.** O sistema deve estimar uma faixa de preço antes da solicitação, considerando categoria, tipo de problema, urgência e informações fornecidas pelo cliente. | Antes de confirmar, Marina vê uma faixa como "R$ 240–380", com indicação do que está incluso e aviso de que o valor final depende da execução. |
| Imprevisibilidade de preço em situação de urgência | **RF04 - Transparência de pagamento.** O sistema deve registrar método de pagamento, status e recibo dentro do agendamento. | Após concluir o serviço, Marina paga por PIX ou cartão no app e consegue consultar o comprovante no histórico. |
| Incerteza sobre resposta, chegada e andamento | **RF05 - Modo Emergência com casamento por proximidade.** O sistema deve localizar profissionais verificados disponíveis e priorizar proximidade real, avaliação e categoria correta. | Ao acionar o SOS, Marina visualiza a indicação do profissional mais próximo, com distância, ETA de 18 minutos no cenário apresentado e status de disponibilidade. |
| Incerteza sobre resposta, chegada e andamento | **RF06 - Acompanhamento em tempo real.** O sistema deve mostrar o status do agendamento e enviar notificações para eventos importantes: aceito, a caminho, em andamento, concluído e pago. | Marina consegue acompanhar a evolução sem precisar ligar ou enviar mensagens fora do app. |
| Incerteza sobre resposta, chegada e andamento | **RF07 - Chat 1:1 no agendamento.** O sistema deve permitir conversa entre cliente e profissional dentro do serviço, com histórico associado ao pedido. | Marina envia detalhes do vazamento e combina informações de chegada sem compartilhar o WhatsApp pessoal. |

### Requisitos não funcionais derivados da jornada

- **RNF01 - Fluxo curto em emergência:** o caminho do SOS deve exigir o mínimo de campos obrigatórios e funcionar bem em celular.
- **RNF02 - Segurança e privacidade:** dados pessoais, localização e mensagens devem ficar protegidos por autenticação e autorização.
- **RNF03 - Resiliência:** se recomendação, cache ou mensageria estiverem indisponíveis, o app deve degradar de forma controlada, mantendo o fluxo principal operável.
- **RNF04 - Clareza visual:** preço, verificação, ETA e status precisam ser legíveis rapidamente, pois Marina usa o app sob estresse.

---

## 5. Reflexão: Como a Jornada Alterou a Visão Inicial do Projeto

A jornada mudou a visão inicial do projeto porque mostrou que o **ZELO não deve ser apenas uma "lista de profissionais melhores"**. Para Marina, o valor principal está em **reduzir a incerteza em cada etapa**: quem entra na casa dela, quanto pode custar, se a pessoa vem mesmo, como acompanhar e o que acontece se o serviço der problema depois.

Também ficou claro que o **Modo Emergência não é só um botão de destaque na interface**. Ele muda as prioridades de design: menos filtros, menos digitação, mais automação, mais transparência e comunicação ativa. No fluxo comum, Marina aceita comparar opções; no fluxo emergencial, ela quer uma recomendação confiável e rápida, com justificativa suficiente para aceitar sem sentir que perdeu o controle.

Outra mudança importante foi perceber que a **avaliação final não é uma etapa secundária**. Ela fecha a jornada de Marina e alimenta a confiança da próxima contratação. Por isso, reputação, pagamento e acompanhamento precisam estar conectados ao agendamento, não espalhados em telas sem relação.

Com o mapa, os requisitos ficaram mais concretos: verificação, orçamento, chat, status em tempo real, pagamento e garantia deixam de ser "funcionalidades interessantes" e passam a ser respostas diretas às dores observadas na persona.

---

## 6. Checklist

- [x] A jornada está coerente com a persona.
- [x] As dores são justificadas.
- [x] Os requisitos derivam das dores identificadas.

---

## 7. Feedback recebido em aula

**Ainda não houve feedback formal registrado para a Entrega 2.** Espaço reservado para atualização após a discussão em aula.

**Pontos que levaremos para validação:**
- Confirmar se o cenário de emergência deve ser o fluxo principal da jornada ou se a banca prefere um fluxo comum de contratação.
- Verificar se a priorização das dores deve incluir também a dor do prestador ou permanecer centrada apenas na persona primária.
- Validar se os requisitos estão no nível adequado para DCU: ligados à experiência do usuário, mas já traduzidos em comportamento observável do sistema.