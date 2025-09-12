export async function up(knex) {
  return knex.schema.createTable('imagens', table => {
    table.increments('id').primary();
    table.integer('cliente_id').unsigned().references('id').inTable('clientes').onDelete('CASCADE');
    table.string('caminho').notNullable(); // Ex: uploads/cliente_1_imagem123.jpg
    table.string('nome_original');
    table.text('hash'); // hash da imagem ou valor associado
    table.timestamp('data_envio').defaultTo(knex.fn.now());
  });
}

export async function down(knex) {
  return knex.schema.dropTable('imagens');
}
