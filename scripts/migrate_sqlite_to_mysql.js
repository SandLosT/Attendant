/**
 * Migração completa: SQLite -> MySQL
 * Executar com: node scripts/migrate_sqlite_to_mysql.js
 */

import sqlite3 from 'sqlite3';
import mysql from 'mysql2/promise';
import path from 'path';

// Caminho do seu banco SQLite
const SQLITE_PATH = path.resolve('src/database/db.sqlite');

// Configuração do MySQL
const MYSQL_CONFIG = {
  host: '127.0.0.1',
  user: 'root',
  password: '130178',
  database: 'sistema_orcamentos',
  multipleStatements: true
};

function normalizeDate(dateStr) {
  if (!dateStr) return null;
  // tenta converter automaticamente
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  // retorna no formato MySQL
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

async function main() {
  console.log('🚀 Iniciando migração do SQLite para MySQL...');
  const mysqlCon = await mysql.createConnection(MYSQL_CONFIG);
  console.log('✅ Conectado ao MySQL');

  const sqliteDb = new sqlite3.Database(SQLITE_PATH, sqlite3.OPEN_READONLY, (err) => {
    if (err) throw err;
  });
  console.log('📂 Banco SQLite aberto:', SQLITE_PATH);

  const allSqlite = (sql, params = []) =>
    new Promise((res, rej) => {
      sqliteDb.all(sql, params, (err, rows) => (err ? rej(err) : res(rows)));
    });

  try {
    // 1️⃣ Desabilita verificações temporariamente
    await mysqlCon.query('SET FOREIGN_KEY_CHECKS = 0;');

    // 2️⃣ Limpa as tabelas antes da migração
    console.log('🧹 Limpando tabelas MySQL...');
    const tables = [
      'orcamentos',
      'imagens',
      'historico_mensagens',
      'clientes',
      'loja_info'
    ];
    for (const table of tables) {
      await mysqlCon.query(`TRUNCATE TABLE ${table};`);
    }

    // === CLIENTES ===
    console.log('📦 Migrando tabela clientes...');
    const clientes = await allSqlite('SELECT * FROM clientes');
    const created_at = normalizeDate(clientes.created_at);
    const updated_at = normalizeDate(clientes.updated_at);
    for (const c of clientes) {
      await mysqlCon.execute(
        `INSERT INTO clientes (id, telefone, nome, etiqueta, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [c.id, c.telefone, c.nome, c.etiqueta, created_at, updated_at, c.created_at,
      c.updated_at]
      );
    }

    // === HISTORICO_MENSAGENS ===
    console.log('💬 Migrando tabela historico_mensagens...');
    const historico = await allSqlite('SELECT * FROM historico_mensagens');
    const data_envio = normalizeDate(historico.data_envio);
    for (const h of historico) {
      await mysqlCon.execute(
        `INSERT INTO historico_mensagens (id, cliente_id, mensagem, tipo, data_envio)
         VALUES (?, ?, ?, ?, ?)`,
        [h.id, h.cliente_id, h.mensagem, h.tipo, data_envio]
      );
    }

    // === IMAGENS ===
    console.log('🖼️ Migrando tabela imagens...');
    const imagens = await allSqlite('SELECT * FROM imagens');
    for (const im of imagens) {
      await mysqlCon.execute(
        `INSERT INTO imagens (id, cliente_id, caminho, nome_original, hash, analisada, data_envio, embedding_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          im.id,
          im.cliente_id,
          im.caminho,
          im.nome_original,
          im.hash,
          im.analisada ?? 0,
          im.data_envio ?? null,
          null, // embedding_hash será preenchido depois com FAISS
          normalizeDate(im.data_envio)
        ]
      );
    }

    // === LOJA_INFO ===
    console.log('🏪 Migrando tabela loja_info...');
    const lojas = await allSqlite('SELECT * FROM loja_info');
    for (const l of lojas) {
      await mysqlCon.execute(
        `INSERT INTO loja_info (id, nome, descricao, servicos, horario_atendimento, politicas_preco, endereco, telefone, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          l.id,
          l.nome,
          l.descricao,
          l.servicos,
          l.horario_atendimento,
          l.politicas_preco,
          l.endereco,
          l.telefone,
          normalizeDate(l.created_at),
          normalizeDate(l.updated_at)
        ]
      );
    }

    // === ORCAMENTOS ===
    console.log('📑 Migrando tabela orcamentos...');
    const orcamentos = await allSqlite('SELECT * FROM orcamentos');
    for (const o of orcamentos) {
      await mysqlCon.execute(
        `INSERT INTO orcamentos (id, cliente_id, imagem_id, valor_estimado, detalhes, status, data_orcamento, embedding_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          o.id,
          o.cliente_id,
          o.imagem_id,
          o.valor_estimado ?? null,
          o.detalhes ?? o.details ?? null,
          o.status ?? null,
          normalizeDate(data_orcamento) ?? null,
          null // embedding_hash ainda será definido
        ]
      );
    }

    // 3️⃣ Reativa foreign keys
    await mysqlCon.query('SET FOREIGN_KEY_CHECKS = 1;');

    console.log('✅ Migração concluída com sucesso!');
  } catch (err) {
    console.error('❌ Erro na migração:', err);
  } finally {
    sqliteDb.close();
    await mysqlCon.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
