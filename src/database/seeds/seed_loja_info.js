export async function seed(knex) {
  await knex('loja_info').del();

  await knex('loja_info').insert({
    nome: 'Gold Impact',
    descricao:
      'A Gold Impact é especializada em reparos de funilaria leve, martelinho de ouro e serviços estéticos automotivos.',
    endereco:
      'St. E Sul ÁREA ESPECIAL 16 Pertinho do Hospital Santa Marta, LOTE 07 - Taguatinga Sul, Brasília - DF, 72025-348',
    horario_atendimento: 'Segunda a Sexta, das 8h às 18h',
    telefone: '(61) 99583-2030',
    servicos: 'Martelinho de ouro, polimento, troca de peças leves, reparos rápidos',
    politicas_preco: JSON.stringify({
      martelinho: 'valor médio R$ 500 por peça (a partir)',
      polimento: 'valor médio R$ 200 por peça',
    }),
    // NÃO inserir created_at / updated_at
  });
}
