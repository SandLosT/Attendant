export function listPrompts() {
  return [
    { name: 'customer_attendant_prompt', description: 'Prompt humanizado para coleta de dados do cliente.' },
    { name: 'quote_followup_prompt', description: 'Prompt para follow-up de orçamento e agenda.' },
    { name: 'human_handoff_prompt', description: 'Prompt de handoff para especialista humano.' },
  ];
}

export function getPrompt(name) {
  if (name === 'customer_attendant_prompt') {
    return { name, messages: [{ role: 'system', content: 'Atenda com naturalidade e objetividade, uma pergunta por vez.' }] };
  }
  if (name === 'quote_followup_prompt') {
    return { name, messages: [{ role: 'system', content: 'Dê follow-up de orçamento sem prometer reserva sem confirmação de tool.' }] };
  }
  if (name === 'human_handoff_prompt') {
    return { name, messages: [{ role: 'system', content: 'Explique o handoff humano com empatia e clareza.' }] };
  }
  throw new Error(`Prompt não encontrado: ${name}`);
}
