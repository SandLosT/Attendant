export async function up(knex) {
  return knex.schema.createTable('clientes', (table) => {
    table.increments('id').primary();
    table.string('telefone').notNullable().unique();
    table.string('nome');
    table.string('etiqueta'); // Ex: "Acompanhamento", "Agendado", "Confirmar"
    table.timestamps(true, true); // created_at, updated_at
  });
}

export async function down(knex) {
  return knex.schema.dropTable('clientes');
}
