export async function up(knex) {
  await knex.schema.alterTable('atendimentos', (table) => {
    table.string('modo', 16).notNullable().defaultTo('AUTO');
    table.datetime('manual_ate').nullable();
    table.string('manual_motivo', 255).nullable();
  });
}

export async function down(knex) {
  await knex.schema.alterTable('atendimentos', (table) => {
    table.dropColumn('modo');
    table.dropColumn('manual_ate');
    table.dropColumn('manual_motivo');
  });
}
