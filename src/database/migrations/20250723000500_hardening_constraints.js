export async function up(knex) {
  await knex.schema.table('imagens_referencia', (table) => {
    table.boolean('temp_status_faz').notNullable().defaultTo(false);
  });

  await knex('imagens_referencia').update(
    'temp_status_faz',
    knex.raw("CASE WHEN LOWER(COALESCE(status_faz, '')) IN ('faz', 'true', '1') THEN 1 ELSE 0 END")
  );

  await knex.schema.table('imagens_referencia', (table) => {
    table.dropColumn('status_faz');
  });

  await knex.schema.table('imagens_referencia', (table) => {
    table.renameColumn('temp_status_faz', 'status_faz');
  });

  await knex.schema.alterTable('agenda_slots', (table) => {
    table.unique(['data', 'periodo']);
  });

  await knex.schema.alterTable('atendimentos', (table) => {
    table.unique(['cliente_id']);
  });

  await knex.schema.alterTable('orcamentos', (table) => {
    table.decimal('match_score', 5, 4).alter();
  });
}

export async function down(knex) {
  await knex.schema.table('imagens_referencia', (table) => {
    table.string('temp_status_faz').notNullable().defaultTo('false');
  });

  await knex('imagens_referencia').update(
    'temp_status_faz',
    knex.raw("CASE WHEN status_faz = 1 THEN 'true' ELSE 'false' END")
  );

  await knex.schema.table('imagens_referencia', (table) => {
    table.dropColumn('status_faz');
  });

  await knex.schema.table('imagens_referencia', (table) => {
    table.renameColumn('temp_status_faz', 'status_faz');
  });

  await knex.schema.alterTable('agenda_slots', (table) => {
    table.dropUnique(['data', 'periodo']);
  });

  await knex.schema.alterTable('atendimentos', (table) => {
    table.dropUnique(['cliente_id']);
  });

  await knex.schema.alterTable('orcamentos', (table) => {
    table.float('match_score').alter();
  });
}
