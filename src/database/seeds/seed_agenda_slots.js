function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export async function seed(knex) {
  const existente = await knex('agenda_slots').first('id');
  if (existente) {
    return;
  }

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const slots = [];
  for (let i = 0; i < 14; i += 1) {
    const data = new Date(hoje);
    data.setDate(data.getDate() + i);
    const dataFormatada = formatDate(data);

    slots.push({
      data: dataFormatada,
      periodo: 'MANHA',
      capacidade: 3,
      reservados: 0,
      bloqueado: false,
    });

    slots.push({
      data: dataFormatada,
      periodo: 'TARDE',
      capacidade: 3,
      reservados: 0,
      bloqueado: false,
    });
  }

  await knex('agenda_slots').insert(slots);
}
