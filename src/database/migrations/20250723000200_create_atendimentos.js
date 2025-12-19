export async function up(knex) {
  return knex.schema.createTable('atendimentos', (table) => {
    table.increments('id').primary();
    table
      .integer('cliente_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('clientes')
      .onDelete('CASCADE');
    table.string('estado').notNullable();
    table
      .integer('orcamento_id_atual')
      .unsigned()
      .references('id')
      .inTable('orcamentos')
      .onDelete('SET NULL');
    table.timestamps(true, true);
  });
}

export async function down(knex) {
  return knex.schema.dropTable('atendimentos');
}
