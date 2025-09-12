export async function seed(knex) {
  // Limpa a tabela
  await knex('loja_info').del();

  // Insere dados
  await knex('loja_info').insert({
    nome: 'Gold Impact',
    descricao: 'A Gold Impact é especializada em reparos de funilaria leve, martelinho de ouro e serviços estéticos automotivos.',
    servicos: 'Martelinho de ouro, polimento, troca de peças leves, reparos rápidos',
    horario_atendimento: 'Segunda a Sexta, das 8h às 18h',
    politicas_preco: '{"martelinho": valor medio 500 a peça", "polimento": "valor medio 200 a peça"}',
    endereco: 'St. E Sul ÁREA ESPECIAL 16 Pertinho do Hospital Santa Marta, LOTE 07 - Taguatinga Sul, Brasília - DF, 72025-348',
    telefone: '(61) 99583-2030',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });
}
