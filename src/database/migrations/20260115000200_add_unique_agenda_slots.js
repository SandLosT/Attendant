const INDEX_NAME = 'agenda_slots_data_periodo_unique';

async function hasAgendaSlotUniqueIndex(knex) {
  const client = knex.client.config.client;

  if (client === 'sqlite3' || client === 'better-sqlite3') {
    const result = await knex('sqlite_master')
      .where({ type: 'index', tbl_name: 'agenda_slots', name: INDEX_NAME })
      .first();
    return Boolean(result);
  }

  if (client === 'mysql' || client === 'mysql2') {
    const result = await knex('information_schema.statistics')
      .select('INDEX_NAME')
      .whereRaw('table_schema = DATABASE()')
      .andWhere({ table_name: 'agenda_slots', index_name: INDEX_NAME })
      .first();
    return Boolean(result);
  }

  if (client === 'pg') {
    const result = await knex('pg_indexes')
      .where({ tablename: 'agenda_slots', indexname: INDEX_NAME })
      .first();
    return Boolean(result);
  }

  return false;
}

export async function up(knex) {
  const hasAgendaSlots = await knex.schema.hasTable('agenda_slots');
  if (!hasAgendaSlots) {
    return;
  }

  const hasIndex = await hasAgendaSlotUniqueIndex(knex);
  if (!hasIndex) {
    await knex.schema.alterTable('agenda_slots', (table) => {
      table.unique(['data', 'periodo'], INDEX_NAME);
    });
  }
}

export async function down(knex) {
  const hasAgendaSlots = await knex.schema.hasTable('agenda_slots');
  if (!hasAgendaSlots) {
    return;
  }

  const hasIndex = await hasAgendaSlotUniqueIndex(knex);
  if (hasIndex) {
    await knex.schema.alterTable('agenda_slots', (table) => {
      table.dropUnique(['data', 'periodo'], INDEX_NAME);
    });
  }
}
