export async function up(knex) {
  await knex.schema.alterTable('atendimentos', (table) => {
    table.string('estado').notNullable().defaultTo('AUTO').alter();
  });

  await knex('atendimentos')
    .where({ estado: 'AGUARDANDO_FOTO' })
    .whereNull('orcamento_id_atual')
    .update({ estado: 'AUTO' });

  await knex('atendimentos')
    .whereNull('estado')
    .orWhere('estado', '')
    .update({ estado: 'AUTO' });
}

export async function down(knex) {
  await knex.schema.alterTable('atendimentos', (table) => {
    table.string('estado').notNullable().defaultTo(null).alter();
  });
}
