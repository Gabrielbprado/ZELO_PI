"""Léxicos por categoria, em pt-BR.

Os termos são comparados sobre o texto NORMALIZADO (minúsculas, sem acento), então
escrevem-se aqui sem acento. Radicais curtos de propósito — `ameac` pega "ameaça",
"ameaçou", "ameaçando" sem precisar de stemmer.

O peso é a força do indício, não a gravidade: "estelionato" é uma palavra que quase só
aparece em denúncia real (peso alto); "taxa" aparece em conversa honesta o tempo todo
(peso baixo, só soma quando acompanhada).
"""

from __future__ import annotations

#: categoria → [(termo, peso)]
LEXICON: dict[str, list[tuple[str, float]]] = {
    "FRAUD": [
        ("golpe", 1.0),
        ("estelionato", 1.0),
        ("me roubou", 1.0),
        ("nao entregou", 0.8),
        ("sumiu com o dinheiro", 1.0),
        ("sumiu depois", 0.7),
        ("cobrou e nao", 0.9),
        ("pagamento antecipado", 0.8),
        ("pagar adiantado", 0.8),
        ("adiantamento", 0.5),
        ("deposito antecipado", 0.9),
        ("pediu deposito", 0.8),
        ("taxa de liberacao", 1.0),
        ("taxa de cadastro", 0.9),
        ("boleto falso", 1.0),
        ("pix falso", 1.0),
        ("comprovante falso", 0.9),
        ("cartao clonado", 1.0),
        ("conta de terceiro", 0.7),
        ("nao existe esse profissional", 0.6),
        ("perfil falso", 0.9),
        ("documento falso", 0.9),
        ("caloteiro", 0.6),
        ("nao pagou", 0.5),
    ],
    "OFF_PLATFORM": [
        ("whatsapp", 0.7),
        ("whats", 0.6),
        ("zap", 0.6),
        ("telegram", 0.7),
        ("fora do app", 1.0),
        ("fora da plataforma", 1.0),
        ("por fora", 0.8),
        ("direto comigo", 0.8),
        ("sem passar pelo app", 1.0),
        ("pix direto", 0.9),
        ("minha chave pix", 0.8),
        ("me chama no", 0.7),
        ("pra fugir da taxa", 1.0),
        ("cancela aqui e", 0.9),
    ],
    "SPAM": [
        ("ganhe dinheiro", 1.0),
        ("renda extra", 0.9),
        ("trabalhe em casa", 0.9),
        ("clique aqui", 0.8),
        ("acesse o link", 0.8),
        ("promocao imperdivel", 0.9),
        ("ultimas vagas", 0.6),
        ("investimento garantido", 1.0),
        ("bitcoin", 0.5),
        ("cripto", 0.5),
        ("divulgacao", 0.5),
        ("propaganda", 0.5),
        ("mensagens repetidas", 0.7),
        ("varias mensagens iguais", 0.8),
        ("flood", 0.6),
        ("corrente", 0.4),
    ],
    "HARASSMENT": [
        ("me xingou", 1.0),
        ("xingando", 0.9),
        ("ofensa", 0.7),
        ("desrespeito", 0.6),
        ("idiota", 0.7),
        ("burro", 0.6),
        ("otari", 0.8),
        ("vagabund", 0.8),
        ("imbecil", 0.8),
        ("cala a boca", 0.7),
        ("racis", 1.0),
        ("homofob", 1.0),
        ("preconceito", 0.8),
        ("perseguindo", 0.7),
        ("nao para de mandar", 0.7),
        ("insistindo depois de eu", 0.8),
    ],
    "INAPPROPRIATE": [
        ("cantada", 0.8),
        ("assedio sexual", 1.0),
        ("mandou nude", 1.0),
        ("foto intima", 1.0),
        ("se insinuou", 0.8),
        ("convite sexual", 1.0),
        ("pelad", 0.9),
        ("safad", 0.7),
        ("conteudo adulto", 0.8),
        ("linguagem chula", 0.6),
        ("palavrao", 0.5),
    ],
    "SAFETY": [
        ("ameac", 1.0),
        ("vou te pegar", 1.0),
        ("me agrediu", 1.0),
        ("agressao", 1.0),
        ("me bateu", 1.0),
        ("empurrou", 0.7),
        ("arma", 0.9),
        ("faca", 0.7),
        ("invadiu minha casa", 1.0),
        ("roubou", 0.8),
        ("furto", 0.8),
        ("levou meus", 0.7),
        ("policia", 0.6),
        ("boletim de ocorrencia", 0.8),
        ("menor de idade", 1.0),
        ("assedio", 0.9),
        ("medo dele", 0.8),
        ("medo dela", 0.8),
        ("perigo", 0.6),
    ],
}

#: O motivo escolhido pelo denunciante é um PRIOR, não a resposta: ele empurra a
#: categoria correspondente, mas o texto pode vencê-lo.
REASON_PRIOR: dict[str, str] = {
    "FRAUD": "FRAUD",
    "INAPPROPRIATE": "INAPPROPRIATE",
    "SAFETY": "SAFETY",
    "NO_SHOW": "NONE",
    "OTHER": "NONE",
}

#: Gravidade-base de cada categoria, antes das agravantes comportamentais.
BASE_SEVERITY: dict[str, str] = {
    "SAFETY": "CRITICAL",
    "HARASSMENT": "HIGH",
    "FRAUD": "HIGH",
    "INAPPROPRIATE": "MEDIUM",
    "OFF_PLATFORM": "MEDIUM",
    "SPAM": "LOW",
    "NONE": "LOW",
}

SEVERITY_ORDER: list[str] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]
