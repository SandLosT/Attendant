export async function up(knex) {
  return knex.schema.createTable('orcamentos', table => {
    table.increments('id').primary();
    table.integer('cliente_id').unsigned().references('id').inTable('clientes');
    table.integer('imagem_id').unsigned().references('id').inTable('imagens');
    table.decimal('valor_estimado');
    table.json('embedding');
    table.text('detalhes'); // Texto explicativo do orçamento
    table.boolean('aprovado').defaultTo(false); // Para o dono aprovar
    table.timestamp('data_orcamento').defaultTo(knex.fn.now());
  });
}

export async function down(knex) {
  return knex.schema.dropTable('orcamentos');
}
