export async function up(knex) {
  return knex.schema.createTable('imagens_referencia', (table) => {
    table.increments('id').primary();
    table.string('caminho').notNullable();
    table.decimal('valor_ref', 10, 2).notNullable();
    table.string('status_faz').notNullable();
    table.string('peca');
    table.text('observacao');
    table.string('embedding_hash');
    table.timestamps(true, true);
  });
}

export async function down(knex) {
  return knex.schema.dropTable('imagens_referencia');
}
