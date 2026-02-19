export async function up(knex) {
  await knex.schema.alterTable('atendimentos', (table) => {
    table.string('estado').notNullable().defaultTo('EM_CONVERSA').alter();
  });

  await knex('atendimentos')
    .where({ estado: 'AGUARDANDO_FOTO', modo: 'AUTO' })
    .where((builder) => builder.whereNull('orcamento_id_atual').orWhere('orcamento_id_atual', 0))
    .update({ estado: 'EM_CONVERSA' });

  await knex('atendimentos')
    .whereNull('estado')
    .orWhere('estado', '')
    .orWhere('estado', 'AUTO')
    .update({ estado: 'EM_CONVERSA' });
}

export async function down(knex) {
  await knex('atendimentos')
    .where({ estado: 'EM_CONVERSA' })
    .update({ estado: 'AUTO' });

  await knex.schema.alterTable('atendimentos', (table) => {
    table.string('estado').notNullable().defaultTo('AUTO').alter();
  });
}
