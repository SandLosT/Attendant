export async function up(knex) {
  await knex.schema.createTable('clientes', (table) => {
    table.increments('id').primary();
    table.string('telefone', 30).notNullable().unique();
    table.string('nome', 120).nullable();
    table.string('etiqueta', 120).nullable();
    table.timestamps(true, true);
  });

  await knex.schema.createTable('loja_info', (table) => {
    table.increments('id').primary();
    table.string('nome', 120).notNullable();
    table.text('descricao').notNullable();
    table.text('servicos').notNullable();
    table.string('horario_atendimento', 120).notNullable();
    table.string('endereco', 255).nullable();
    table.string('telefone', 40).nullable();
    table.string('instagram', 120).nullable();
    table.text('politicas_preco').nullable();
    table.timestamps(true, true);
  });

  await knex.schema.createTable('imagens', (table) => {
    table.increments('id').primary();
    table.integer('cliente_id').unsigned().notNullable().references('id').inTable('clientes').onDelete('CASCADE');
    table.string('caminho', 255).notNullable();
    table.string('nome_original', 255).nullable();
    table.string('hash', 128).nullable();
    table.timestamp('data_envio').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('historico_mensagens', (table) => {
    table.increments('id').primary();
    table.integer('cliente_id').unsigned().notNullable().references('id').inTable('clientes').onDelete('CASCADE');
    table.enum('tipo', ['entrada', 'resposta']).notNullable();
    table.text('mensagem').notNullable();
    table.timestamp('data_envio').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('orcamentos', (table) => {
    table.increments('id').primary();
    table.integer('cliente_id').unsigned().notNullable().references('id').inTable('clientes').onDelete('CASCADE');
    table.integer('imagem_id').unsigned().nullable().references('id').inTable('imagens').onDelete('SET NULL');
    table.enum('status', ['DRAFT', 'ANALYZED', 'NEEDS_HUMAN', 'APPROVED', 'REJECTED', 'CLOSED']).notNullable().defaultTo('DRAFT');
    table.decimal('valor_estimado', 10, 2).nullable();
    table.decimal('valor_final', 10, 2).nullable();
    table.decimal('match_score', 8, 6).nullable();
    table.integer('ref_image_id').unsigned().nullable();
    table.date('data_preferida').nullable();
    table.string('periodo_preferido', 16).nullable();
    table.date('slot_data').nullable();
    table.string('slot_periodo', 16).nullable();
    table.datetime('data_agendada').nullable();
    table.datetime('fechado_em').nullable();
    table.text('detalhes').nullable();
    table.timestamps(true, true);
  });

  await knex.schema.createTable('atendimentos', (table) => {
    table.increments('id').primary();
    table.integer('cliente_id').unsigned().notNullable().unique().references('id').inTable('clientes').onDelete('CASCADE');
    table.enum('estado', ['OPEN', 'WAITING_IMAGE', 'IN_ANALYSIS', 'WAITING_SCHEDULE', 'HUMAN_HANDOFF', 'CLOSED', 'CANCELLED']).notNullable().defaultTo('OPEN');
    table.enum('modo', ['AUTO', 'MANUAL']).notNullable().defaultTo('AUTO');
    table.string('manual_motivo', 255).nullable();
    table.integer('orcamento_id_atual').unsigned().nullable().references('id').inTable('orcamentos').onDelete('SET NULL');
    table.timestamps(true, true);
  });

  await knex.schema.createTable('agenda_slots', (table) => {
    table.increments('id').primary();
    table.date('data').notNullable();
    table.enum('periodo', ['MANHA', 'TARDE']).notNullable();
    table.integer('capacidade').unsigned().notNullable().defaultTo(3);
    table.integer('reservados').unsigned().notNullable().defaultTo(0);
    table.boolean('bloqueado').notNullable().defaultTo(false);
    table.unique(['data', 'periodo']);
    table.timestamps(true, true);
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('agenda_slots');
  await knex.schema.dropTableIfExists('atendimentos');
  await knex.schema.dropTableIfExists('orcamentos');
  await knex.schema.dropTableIfExists('historico_mensagens');
  await knex.schema.dropTableIfExists('imagens');
  await knex.schema.dropTableIfExists('loja_info');
  await knex.schema.dropTableIfExists('clientes');
}
