export async function up(knex) {
  await knex.schema.table('orcamentos', (table) => {
    table.date('slot_data').nullable();
    table.string('slot_periodo', 16).nullable();
    table.dateTime('slot_reservado_em').nullable();
  });
}

export async function down(knex) {
  await knex.schema.table('orcamentos', (table) => {
    table.dropColumn('slot_data');
    table.dropColumn('slot_periodo');
    table.dropColumn('slot_reservado_em');
  });
}
