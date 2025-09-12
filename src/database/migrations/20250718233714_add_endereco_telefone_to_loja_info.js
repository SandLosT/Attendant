export async function up(knex) {
  return knex.schema.table('loja_info', (table) => {
    table.string('endereco');
    table.string('telefone');
  });
}

export async function down(knex) {
  return knex.schema.table('loja_info', (table) => {
    table.dropColumn('endereco');
    table.dropColumn('telefone');
  });
}
// 