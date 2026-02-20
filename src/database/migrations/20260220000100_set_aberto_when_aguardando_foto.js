export async function up(knex) {
  await knex('atendimentos')
    .where({ estado: 'AGUARDANDO_FOTO' })
    .update({ estado: 'ABERTO' });

  await knex('atendimentos')
    .whereNull('estado')
    .orWhere('estado', '')
    .orWhere('estado', 'EM_CONVERSA')
    .orWhere('estado', 'AUTO')
    .update({ estado: 'ABERTO' });

  await knex.schema.alterTable('atendimentos', (table) => {
    table.string('estado').notNullable().defaultTo('ABERTO').alter();
  });
}

export async function down(knex) {
  await knex('atendimentos')
    .where({ estado: 'ABERTO' })
    .update({ estado: 'AGUARDANDO_FOTO' });

  await knex.schema.alterTable('atendimentos', (table) => {
    table.string('estado').notNullable().defaultTo('EM_CONVERSA').alter();
  });
}
