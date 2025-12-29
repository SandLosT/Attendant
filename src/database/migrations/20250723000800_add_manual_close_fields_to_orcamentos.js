export async function up(knex) {
  await knex.schema.alterTable('orcamentos', (table) => {
    table.decimal('valor_final', 10, 2).nullable();
    table.datetime('fechado_em').nullable();
  });
}

export async function down(knex) {
  await knex.schema.alterTable('orcamentos', (table) => {
    table.dropColumn('valor_final');
    table.dropColumn('fechado_em');
  });
}
