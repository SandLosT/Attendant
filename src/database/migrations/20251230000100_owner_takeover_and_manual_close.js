export async function up(knex) {
  await knex.schema.alterTable('atendimentos', (table) => {
    table.string('modo').notNullable().defaultTo('AUTO');
    table.datetime('modo_manual_ate').nullable();
    table.string('estado_anterior').nullable();
  });

  await knex.schema.alterTable('orcamentos', (table) => {
    table.decimal('valor_final', 10, 2).nullable();
    table.datetime('fechado_em').nullable();
    table.string('fechado_por').nullable();
    table.text('observacao').nullable();
  });
}

export async function down(knex) {
  await knex.schema.alterTable('orcamentos', (table) => {
    table.dropColumn('valor_final');
    table.dropColumn('fechado_em');
    table.dropColumn('fechado_por');
    table.dropColumn('observacao');
  });

  await knex.schema.alterTable('atendimentos', (table) => {
    table.dropColumn('modo');
    table.dropColumn('modo_manual_ate');
    table.dropColumn('estado_anterior');
  });
}
