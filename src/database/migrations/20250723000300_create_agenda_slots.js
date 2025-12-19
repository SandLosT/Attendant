export async function up(knex) {
  return knex.schema.createTable('agenda_slots', (table) => {
    table.increments('id').primary();
    table.date('data').notNullable();
    table.string('periodo').notNullable();
    table.integer('capacidade').unsigned().notNullable();
    table.integer('reservados').unsigned().notNullable().defaultTo(0);
    table.boolean('bloqueado').notNullable().defaultTo(false);
    table.timestamps(true, true);
  });
}

export async function down(knex) {
  return knex.schema.dropTable('agenda_slots');
}
