export function listPrompts() {
  return [
    {
      name: 'customer_attendant_prompt',
      description: 'Prompt de atendimento humanizado para etapa inicial e coleta de dados.',
    },
    {
      name: 'quote_followup_prompt',
      description: 'Prompt para follow-up de orçamento e agendamento.',
    },
    {
      name: 'human_handoff_prompt',
      description: 'Prompt de transferência para atendimento humano.',
    },
  ];
}

export function getPrompt(name: string) {
  if (name === 'customer_attendant_prompt') {
    return {
      name,
      messages: [{ role: 'system', content: 'Atenda com clareza, empatia e objetividade. Faça apenas uma pergunta por vez.' }],
    };
  }
  if (name === 'quote_followup_prompt') {
    return {
      name,
      messages: [{ role: 'system', content: 'Oriente o cliente sobre orçamento e agenda sem prometer o que não foi confirmado em tool.' }],
    };
  }
  if (name === 'human_handoff_prompt') {
    return {
      name,
      messages: [{ role: 'system', content: 'Informe handoff humano com transparência e prazo curto de retorno.' }],
    };
  }

  throw new Error(`Prompt não encontrado: ${name}`);
}
