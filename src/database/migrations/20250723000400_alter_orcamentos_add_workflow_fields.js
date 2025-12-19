export async function up(knex) {
  return knex.schema.alterTable('orcamentos', (table) => {
    table.float('match_score');
    table
      .integer('ref_image_id')
      .unsigned()
      .references('id')
      .inTable('imagens_referencia')
      .onDelete('SET NULL');
    table.date('data_preferida');
    table.string('periodo_preferido');
    table.datetime('data_agendada');
    table.timestamp('aprovado_em');
    table.text('recusado_motivo');
  });
}

export async function down(knex) {
  return knex.schema.alterTable('orcamentos', (table) => {
    table.dropColumn('match_score');
    table.dropColumn('ref_image_id');
    table.dropColumn('data_preferida');
    table.dropColumn('periodo_preferido');
    table.dropColumn('data_agendada');
    table.dropColumn('aprovado_em');
    table.dropColumn('recusado_motivo');
  });
}
