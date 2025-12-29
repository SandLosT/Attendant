export async function up(knex) {
  const hasModo = await knex.schema.hasColumn('atendimentos', 'modo');
  const hasModoManualAte = await knex.schema.hasColumn('atendimentos', 'modo_manual_ate');
  const hasEstadoAnterior = await knex.schema.hasColumn('atendimentos', 'estado_anterior');

  if (!hasModo || !hasModoManualAte || !hasEstadoAnterior) {
    await knex.schema.alterTable('atendimentos', (table) => {
      if (!hasModo) {
        table.string('modo').notNullable().defaultTo('AUTO');
      }
      if (!hasModoManualAte) {
        table.datetime('modo_manual_ate').nullable();
      }
      if (!hasEstadoAnterior) {
        table.string('estado_anterior').nullable();
      }
    });
  }

  const hasValorFinal = await knex.schema.hasColumn('orcamentos', 'valor_final');
  const hasFechadoEm = await knex.schema.hasColumn('orcamentos', 'fechado_em');
  const hasFechadoPor = await knex.schema.hasColumn('orcamentos', 'fechado_por');
  const hasObservacao = await knex.schema.hasColumn('orcamentos', 'observacao');

  if (!hasValorFinal || !hasFechadoEm || !hasFechadoPor || !hasObservacao) {
    await knex.schema.alterTable('orcamentos', (table) => {
      if (!hasValorFinal) {
        table.decimal('valor_final', 10, 2).nullable();
      }
      if (!hasFechadoEm) {
        table.datetime('fechado_em').nullable();
      }
      if (!hasFechadoPor) {
        table.string('fechado_por').nullable();
      }
      if (!hasObservacao) {
        table.text('observacao').nullable();
      }
    });
  }
}

export async function down(knex) {
  const hasValorFinal = await knex.schema.hasColumn('orcamentos', 'valor_final');
  const hasFechadoEm = await knex.schema.hasColumn('orcamentos', 'fechado_em');
  const hasFechadoPor = await knex.schema.hasColumn('orcamentos', 'fechado_por');
  const hasObservacao = await knex.schema.hasColumn('orcamentos', 'observacao');

  if (hasValorFinal || hasFechadoEm || hasFechadoPor || hasObservacao) {
    await knex.schema.alterTable('orcamentos', (table) => {
      if (hasValorFinal) {
        table.dropColumn('valor_final');
      }
      if (hasFechadoEm) {
        table.dropColumn('fechado_em');
      }
      if (hasFechadoPor) {
        table.dropColumn('fechado_por');
      }
      if (hasObservacao) {
        table.dropColumn('observacao');
      }
    });
  }

  const hasModo = await knex.schema.hasColumn('atendimentos', 'modo');
  const hasModoManualAte = await knex.schema.hasColumn('atendimentos', 'modo_manual_ate');
  const hasEstadoAnterior = await knex.schema.hasColumn('atendimentos', 'estado_anterior');

  if (hasModo || hasModoManualAte || hasEstadoAnterior) {
    await knex.schema.alterTable('atendimentos', (table) => {
      if (hasModo) {
        table.dropColumn('modo');
      }
      if (hasModoManualAte) {
        table.dropColumn('modo_manual_ate');
      }
      if (hasEstadoAnterior) {
        table.dropColumn('estado_anterior');
      }
    });
  }
}
