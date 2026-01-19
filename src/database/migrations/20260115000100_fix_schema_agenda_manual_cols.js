export async function up(knex) {
  const hasOrcamentos = await knex.schema.hasTable('orcamentos');
  if (hasOrcamentos) {
    const hasSlotData = await knex.schema.hasColumn('orcamentos', 'slot_data');
    const hasSlotPeriodo = await knex.schema.hasColumn('orcamentos', 'slot_periodo');
    const hasSlotReservadoEm = await knex.schema.hasColumn('orcamentos', 'slot_reservado_em');

    if (!hasSlotData || !hasSlotPeriodo || !hasSlotReservadoEm) {
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
      });
    }
  }

  const hasAtendimentos = await knex.schema.hasTable('atendimentos');
  if (hasAtendimentos) {
    const hasModoManualAte = await knex.schema.hasColumn('atendimentos', 'modo_manual_ate');
    if (!hasModoManualAte) {
      await knex.schema.alterTable('atendimentos', (table) => {
        table.dateTime('modo_manual_ate').nullable();
      });
    }
  }
}

export async function down(knex) {
  const hasOrcamentos = await knex.schema.hasTable('orcamentos');
  if (hasOrcamentos) {
    const hasSlotData = await knex.schema.hasColumn('orcamentos', 'slot_data');
    const hasSlotPeriodo = await knex.schema.hasColumn('orcamentos', 'slot_periodo');
    const hasSlotReservadoEm = await knex.schema.hasColumn('orcamentos', 'slot_reservado_em');

    if (hasSlotData || hasSlotPeriodo || hasSlotReservadoEm) {
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
      });
    }
  }

  const hasAtendimentos = await knex.schema.hasTable('atendimentos');
  if (hasAtendimentos) {
    const hasModoManualAte = await knex.schema.hasColumn('atendimentos', 'modo_manual_ate');
    if (hasModoManualAte) {
      await knex.schema.alterTable('atendimentos', (table) => {
        table.dropColumn('modo_manual_ate');
      });
    }
  }
}
