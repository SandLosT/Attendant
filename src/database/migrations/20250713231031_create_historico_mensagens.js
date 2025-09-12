export async function up(knex) {
  return knex.schema.createTable('historico_mensagens', (table) => {
    table.increments('id').primary();
    table
      .integer('cliente_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('clientes')
      .onDelete('CASCADE');
    table.text('mensagem').notNullable();
    table
      .enu('tipo', ['entrada', 'resposta'], { useNative: true, enumName: 'tipo_enum' })
      .notNullable(); // quem enviou
    table.timestamp('data_envio').defaultTo(knex.fn.now());
  });
}

export async function down(knex) {
  // primeiro remove o enum (SQLite ignora, mas PostgreSQL exige)
  await knex.schema.raw('DROP TYPE IF EXISTS tipo_enum;');
  return knex.schema.dropTable('historico_mensagens');
}
