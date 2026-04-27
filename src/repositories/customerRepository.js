import { db } from '../database/index.js';

export async function findCustomerByPhone(phone) {
  return db('clientes').where({ telefone: phone }).first();
}

export async function getOrCreateCustomer(phone) {
  let customer = await findCustomerByPhone(phone);
  if (customer) return customer;

  const ids = await db('clientes').insert({ telefone: phone });
  const id = Array.isArray(ids) ? ids[0] : ids;
  return db('clientes').where({ id }).first();
}
