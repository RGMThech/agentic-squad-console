---
id: 000
titulo: Receita diária por loja (exemplo)
versao: 1.1
status: aprovado
solicitante: Diretoria Comercial
aprovado_por: Operador
aprovado_em: 2026-10-29
exemplo: true
tolerancia_reconciliacao_pc: 0
---

# Receita diária por loja (exemplo)

> Feature de exemplo que mostra o padrão esperado de uma spec. Use como referência.

## 1. Contexto e problema
A Diretoria Comercial acompanha a receita das lojas por planilhas montadas manualmente a partir do ERP, com até dois dias de atraso e divergências frequentes por conta de pedidos cancelados e correções de desconto.

## 2. Objetivo
Disponibilizar, todo dia até 06:00, a receita bruta, os descontos, a receita líquida, a quantidade de pedidos e o ticket médio por loja e por dia, com números que batem com o ERP.

## 3. Fora de escopo
- Devoluções após a entrega (tratadas em feature futura)
- Metas por loja
- Visão por produto

## 4. Público e uso
| Público | Pergunta que responde | Frequência de uso |
|---------|-----------------------|-------------------|
| Diretoria Comercial | Quais lojas estão acima/abaixo da média? | Diária |
| Gerentes de loja | Como foi meu dia de ontem? | Diária |

## 5. Fontes de dados
| Fonte | Sistema | Entidade | Atualização | Observações |
|-------|---------|----------|-------------|-------------|
| ERP | ERP Vendas | Pedidos | Extração a cada hora | Um pedido pode ser reenviado com correções |

## 6. Regras de negócio
| ID | Regra | Exemplo |
|----|-------|---------|
| RN-01 | Pedidos com status `CANCELADO` não entram em nenhuma métrica | P007 cancelado depois de pago → fora |
| RN-02 | Quando um pedido é reenviado, vale a versão mais recente recebida | P004 com desconto corrigido de 20 para 40 → vale 40 |
| RN-03 | A data da venda é a data do pedido (`pedido_ts`), não a data da carga | Pedido às 23h do dia 1, carregado dia 2 → conta no dia 1 |
| RN-04 | Valores em reais, arredondados em 2 casas apenas no resultado final | — |

## 7. Métricas
| ID | Nome | Definição de negócio | Fórmula | Granularidade | Filtros | Nulos/zeros |
|----|------|----------------------|---------|---------------|---------|-------------|
| M-01 | Receita bruta | Soma do valor dos pedidos antes do desconto | `SUM(valor_bruto_vl)` | loja × dia | RN-01 | Desconto nulo = 0 |
| M-02 | Receita líquida | Receita bruta menos descontos | `SUM(valor_bruto_vl - desconto_vl)` | loja × dia | RN-01 | — |
| M-03 | Pedidos | Quantidade de pedidos válidos | `COUNT(pedido_id)` | loja × dia | RN-01 | — |
| M-04 | Ticket médio | Receita líquida por pedido | `M-02 / M-03` | loja × dia | RN-01 | Não existe linha sem pedido |

## 8. Dimensões e granularidade
1 linha por loja (`loja_cd`) por dia (`venda_dt`), apenas para dias com pelo menos um pedido válido.

## 9. Requisitos não funcionais
- Frescor (SLA): dados de D-1 disponíveis até 06:00
- Histórico necessário: 24 meses
- Volume estimado: ~50 mil pedidos/dia
- Dados pessoais envolvidos (LGPD): `cliente_id` na silver; **não** chega à gold

## 10. Critérios de aceite
| ID | Dado | Quando | Então |
|----|------|--------|-------|
| CA-01 | Um pedido cancelado | a gold é gerada | ele não compõe nenhuma métrica |
| CA-02 | Um pedido recebido duas vezes com descontos diferentes | a gold é gerada | vale o desconto da versão mais recente |
| CA-03 | Os casos de ouro de `tests/golden/000-exemplo-receita-diaria` | a gold é gerada | o resultado é idêntico ao esperado |
| CA-04 | Qualquer execução | a gold é gerada | não existem duas linhas para a mesma loja e dia |
| CA-05 | A tabela gold | inspecionada | não contém nenhuma coluna de dado pessoal |

## 11. Dúvidas abertas
<!-- Spec só pode ser aprovada sem itens "- [ ]" nesta seção -->
- [x] Pedido cancelado após a meia-noite sai do dia original? → Sim (ver Decisões)

## 12. Decisões
| Data | Decisão | Quem decidiu |
|------|---------|--------------|
| 2026-10-29 | Cancelamento posterior remove o pedido do dia original (RN-01 + RN-02) | Operador |

## 13. Histórico de versões
| Versão | Data | Mudança |
|--------|------|---------|
| 1.0 | 2026-10-29 | Versão inicial |
| 1.1 | 2026-10-29 | Incluída RN-03 após dúvida sobre data da venda |
