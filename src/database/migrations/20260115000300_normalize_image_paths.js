export async function up(knex) {
  await knex.raw("UPDATE imagens SET caminho = REPLACE(caminho, '\\\\', '/');");

  const hasImagensReferencia = await knex.schema.hasTable('imagens_referencia');
  if (hasImagensReferencia) {
    await knex.raw(
      "UPDATE imagens_referencia SET caminho = REPLACE(caminho, '\\\\', '/');"
    );
  }
}

export async function down() {
  return Promise.resolve();
}
