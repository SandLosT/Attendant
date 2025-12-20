export async function up(knex) {
  return knex.schema.createTable('imagens', (table) => {
    table.increments('id').primary();
    table
      .integer('cliente_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('clientes')
      .onDelete('CASCADE');
    table.string('caminho').notNullable();      // Ex: 'uploads/abc123.jpg'
    table.string('nome_original');               // Ex: 'IMG_2024.jpg'
    table.string('hash');                        // para detectar duplicatas
    table.boolean('analisada').defaultTo(false);
    table.timestamp('data_envio').defaultTo(knex.fn.now());
  });
}

export async function down(knex) {
  return knex.schema.dropTable('imagens');
}
