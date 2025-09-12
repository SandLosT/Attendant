export async function up(knex) {
  return knex.schema.createTable('loja_info', table => {
    table.increments('id').primary();
    table.string('nome').notNullable().defaultTo('Gold Impact');
    table.text('descricao').notNullable();
    table.text('servicos').notNullable();
    table.string('horario_atendimento').notNullable();
    table.text('politicas_preco').defaultTo('{}'); // armazenado como string JSON
    table.timestamps(true, true);
  });
}

export async function down(knex) {
  return knex.schema.dropTable('loja_info');
}
