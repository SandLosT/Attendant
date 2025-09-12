export async function up(knex) {
  return knex.schema.createTable('orcamentos', (table) => {
    table.increments('id').primary();
    table
      .integer('cliente_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('clientes')
      .onDelete('CASCADE');
    table
      .integer('imagem_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('imagens')
      .onDelete('SET NULL');
    table.float('valor_estimado').notNullable();
    table.text('detalhes'); // Texto descritivo gerado pela IA
    table
      .enu('status', ['pendente', 'confirmado', 'recusado'], {
        useNative: true,
        enumName: 'status_enum'
      })
      .defaultTo('pendente');
    table.timestamp('data_orcamento').defaultTo(knex.fn.now());
  });
}

export async function down(knex) {
  // remover enum se necessário
  await knex.schema.raw('DROP TYPE IF EXISTS status_enum;');
  return knex.schema.dropTable('orcamentos');
}
