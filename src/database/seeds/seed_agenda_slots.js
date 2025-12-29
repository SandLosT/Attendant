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

  const diasGerar = Number(process.env.AGENDA_DIAS_GERAR) || 30;
  const capacidadePadrao = Number(process.env.AGENDA_CAPACIDADE_PADRAO) || 3;

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const slots = [];
  for (let i = 0; i < diasGerar; i += 1) {
    const data = new Date(hoje);
    data.setDate(data.getDate() + i);
    const dataFormatada = formatDate(data);

    slots.push({
      data: dataFormatada,
      periodo: 'MANHA',
      capacidade: capacidadePadrao,
      reservados: 0,
      bloqueado: 0,
    });

    slots.push({
      data: dataFormatada,
      periodo: 'TARDE',
      capacidade: capacidadePadrao,
      reservados: 0,
      bloqueado: 0,
    });
  }

  await knex('agenda_slots').insert(slots);
}
