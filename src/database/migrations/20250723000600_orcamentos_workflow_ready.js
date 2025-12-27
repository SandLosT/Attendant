export async function up(knex) {
  await knex.schema.raw(`
    UPDATE orcamentos
    SET status = CASE status
      WHEN 'pendente' THEN 'PENDENTE'
      WHEN 'confirmado' THEN 'CONFIRMADO'
      WHEN 'recusado' THEN 'RECUSADO'
      ELSE status
    END
  `);

  await knex.schema.raw(`
    ALTER TABLE orcamentos
    MODIFY COLUMN status VARCHAR(64) NOT NULL DEFAULT 'PENDENTE'
  `);

  await knex.schema.raw(`
    ALTER TABLE orcamentos
    MODIFY COLUMN valor_estimado DECIMAL(10,2) NULL
  `);

  const [rows] = await knex.schema.raw(`
    SELECT COUNT(1) AS count
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'orcamentos'
      AND index_name = 'idx_orcamentos_cliente_status'
  `);

  const indexCount = Number(rows?.[0]?.count ?? 0);

  if (indexCount === 0) {
    await knex.schema.raw(`
      CREATE INDEX idx_orcamentos_cliente_status
      ON orcamentos (cliente_id, status)
    `);
  }
}

export async function down(knex) {
  await knex.schema.raw(`
    DROP INDEX idx_orcamentos_cliente_status ON orcamentos
  `);

  await knex.schema.raw(`
    UPDATE orcamentos
    SET status = CASE status
      WHEN 'PENDENTE' THEN 'pendente'
      WHEN 'CONFIRMADO' THEN 'confirmado'
      WHEN 'APROVADO' THEN 'confirmado'
      WHEN 'RECUSADO' THEN 'recusado'
      ELSE 'pendente'
    END
  `);

  await knex.schema.raw(`
    UPDATE orcamentos
    SET valor_estimado = 0
    WHERE valor_estimado IS NULL
  `);

  await knex.schema.raw(`
    ALTER TABLE orcamentos
    MODIFY COLUMN valor_estimado FLOAT NOT NULL
  `);

  await knex.schema.raw(`
    ALTER TABLE orcamentos
    MODIFY COLUMN status ENUM('pendente', 'confirmado', 'recusado')
      NOT NULL DEFAULT 'pendente'
  `);
}
