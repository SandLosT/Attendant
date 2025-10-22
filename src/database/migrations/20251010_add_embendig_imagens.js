export async function up(knex) {
  return knex.schema.table('imagens', (table) => {
    table.string('endereco');
    table.string('telefone');
  });
}

// quero inserir uma nova coluna na tabela imagens chamada embedding que vai guardar o vetor do embedding da imagem
export async function down(knex) {
  
}