export async function up(knex) {
  const hasSlotData = await knex.schema.hasColumn('orcamentos', 'slot_data');
  const hasSlotPeriodo = await knex.schema.hasColumn('orcamentos', 'slot_periodo');
  const hasSlotReservadoEm = await knex.schema.hasColumn('orcamentos', 'slot_reservado_em');
  const hasDataPreferida = await knex.schema.hasColumn('orcamentos', 'data_preferida');
  const hasPeriodoPreferido = await knex.schema.hasColumn('orcamentos', 'periodo_preferido');

  if (
    !hasSlotData ||
    !hasSlotPeriodo ||
    !hasSlotReservadoEm ||
    !hasDataPreferida ||
    !hasPeriodoPreferido
  ) {
    await knex.schema.alterTable('orcamentos', (table) => {
      if (!hasSlotData) {
        table.date('slot_data').nullable();
      }
      if (!hasSlotPeriodo) {
        table.string('slot_periodo', 10).nullable();
      }
      if (!hasSlotReservadoEm) {
        table.dateTime('slot_reservado_em').nullable();
      }
      if (!hasDataPreferida) {
        table.date('data_preferida').nullable();
      }
      if (!hasPeriodoPreferido) {
        table.string('periodo_preferido').nullable();
      }
    });
  }

  const hasModoManualAte = await knex.schema.hasColumn('atendimentos', 'modo_manual_ate');
  if (!hasModoManualAte) {
    await knex.schema.alterTable('atendimentos', (table) => {
      table.dateTime('modo_manual_ate').nullable();
    });
  }

  const hasManualAte = await knex.schema.hasColumn('atendimentos', 'manual_ate');
  if (hasManualAte) {
    await knex('atendimentos')
      .whereNull('modo_manual_ate')
      .update({ modo_manual_ate: knex.raw('manual_ate') });

    await knex.schema.alterTable('atendimentos', (table) => {
      table.dropColumn('manual_ate');
    });
  }
}

export async function down(knex) {
  const hasSlotData = await knex.schema.hasColumn('orcamentos', 'slot_data');
  const hasSlotPeriodo = await knex.schema.hasColumn('orcamentos', 'slot_periodo');
  const hasSlotReservadoEm = await knex.schema.hasColumn('orcamentos', 'slot_reservado_em');
  const hasDataPreferida = await knex.schema.hasColumn('orcamentos', 'data_preferida');
  const hasPeriodoPreferido = await knex.schema.hasColumn('orcamentos', 'periodo_preferido');

  if (
    hasSlotData ||
    hasSlotPeriodo ||
    hasSlotReservadoEm ||
    hasDataPreferida ||
    hasPeriodoPreferido
  ) {
    await knex.schema.alterTable('orcamentos', (table) => {
      if (hasSlotData) {
        table.dropColumn('slot_data');
      }
      if (hasSlotPeriodo) {
        table.dropColumn('slot_periodo');
      }
      if (hasSlotReservadoEm) {
        table.dropColumn('slot_reservado_em');
      }
      if (hasDataPreferida) {
        table.dropColumn('data_preferida');
      }
      if (hasPeriodoPreferido) {
        table.dropColumn('periodo_preferido');
      }
    });
  }

  const hasModoManualAte = await knex.schema.hasColumn('atendimentos', 'modo_manual_ate');
  if (hasModoManualAte) {
    await knex.schema.alterTable('atendimentos', (table) => {
      table.dropColumn('modo_manual_ate');
    });
  }

  const hasManualAte = await knex.schema.hasColumn('atendimentos', 'manual_ate');
  if (!hasManualAte) {
    await knex.schema.alterTable('atendimentos', (table) => {
      table.dateTime('manual_ate').nullable();
    });
  }
}
